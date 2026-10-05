import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

const itemSchema = z.object({
  materialId: z.uuid("Invalid material"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
});

const createSchema = z.object({
  ot: z.string().trim().max(64).optional(),
  kind: z.enum(["OBRA", "EMERGENCIAL"]).default("OBRA"),
  vehiclePlate: z.string().trim().max(16).optional(),
  nfNumber: z.string().trim().max(64).optional(),
  destination: z.string().trim().min(1, "Destination is required").max(200),
  foreman: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(1000).optional(),
  items: z.array(itemSchema).min(1, "At least one item is required").max(200),
});

function invalid(issues: { field: string; message: string }[], status: number) {
  return NextResponse.json({ errors: issues }, { status });
}

/** List issues (material requisitions/OT vouchers), newest first. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR"]);
  if ("response" in auth) return auth.response;

  const status = request.nextUrl.searchParams.get("status");
  const kind = request.nextUrl.searchParams.get("kind");
  const issues = await prisma.issue.findMany({
    where: {
      ...(status === "DRAFT" || status === "CLOSED" || status === "CANCELLED" ? { status } : {}),
      ...(kind === "OBRA" || kind === "EMERGENCIAL" ? { kind } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      number: true,
      ot: true,
      kind: true,
      vehiclePlate: true,
      nfNumber: true,
      destination: true,
      foreman: true,
      status: true,
      createdAt: true,
      user: { select: { name: true } },
      items: {
        select: {
          quantity: true,
          fulfilledQuantity: true,
          material: { select: { id: true, code: true, name: true, unit: true } },
        },
      },
    },
  });

  return NextResponse.json({ data: issues });
}

/**
 * Open a draft issue. Drafts move nothing — stock only leaves the warehouse
 * when the issue is closed.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR"]);
  if ("response" in auth) return auth.response;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return invalid(
      parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      })),
      400,
    );
  }

  const materialIds = [...new Set(parsed.data.items.map((item) => item.materialId))];
  if (materialIds.length !== parsed.data.items.length) {
    return invalid(
      [{ field: "items", message: "Duplicate material — merge into a single line" }],
      409,
    );
  }
  const materials = await prisma.material.findMany({
    where: { id: { in: materialIds } },
    select: { id: true, code: true, disabled: true },
  });
  const materialById = new Map(materials.map((m) => [m.id, m]));
  for (const [index, item] of parsed.data.items.entries()) {
    const material = materialById.get(item.materialId);
    if (!material) {
      return invalid(
        [{ field: `items.${index}.materialId`, message: "Material not found in catalog" }],
        404,
      );
    }
    if (material.disabled) {
      return invalid(
        [{ field: `items.${index}.materialId`, message: `Material "${material.code}" is disabled` }],
        409,
      );
    }
  }

  const issue = await prisma.issue.create({
    data: {
      ot: parsed.data.ot || undefined,
      kind: parsed.data.kind,
      vehiclePlate: parsed.data.vehiclePlate || undefined,
      nfNumber: parsed.data.nfNumber || undefined,
      destination: parsed.data.destination,
      foreman: parsed.data.foreman || undefined,
      notes: parsed.data.notes || undefined,
      userId: auth.user.userId,
      items: {
        create: parsed.data.items.map((item) => ({
          materialId: item.materialId,
          quantity: item.quantity,
        })),
      },
    },
    select: {
      id: true,
      number: true,
      ot: true,
      kind: true,
      vehiclePlate: true,
      nfNumber: true,
      destination: true,
      foreman: true,
      notes: true,
      status: true,
      items: {
        select: {
          id: true,
          quantity: true,
          fulfilledQuantity: true,
          material: { select: { id: true, code: true, name: true, unit: true } },
        },
      },
    },
  });

  return NextResponse.json({ data: issue }, { status: 201 });
}
