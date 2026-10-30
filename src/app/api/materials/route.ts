import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

const createSchema = z.object({
  code: z.string().trim().min(1, "Code is required").max(64),
  name: z.string().trim().min(1, "Name is required").max(200),
  unit: z.string().trim().min(1, "Unit is required").max(16).default("UN"),
  minStock: z.coerce.number().int().min(0).default(0),
  costCents: z.coerce.number().int().min(0).default(0),
  disabled: z.coerce.boolean().default(false),
});

function invalid(issues: { field: string; message: string }[], status: number) {
  return NextResponse.json({ errors: issues }, { status });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR", "VIEWER"]);
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const onlyWithStock = searchParams.get("onlyWithStock") === "true";

  const where: any = { disabled: false };
  if (q) {
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
    ];
  }
  if (onlyWithStock) {
    where.stocks = { some: { quantity: { gt: 0 } } };
  }

  const materials = await prisma.material.findMany({
    where,
    orderBy: { code: "asc" },
    take: 200,
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      minStock: true,
      costCents: true,
      disabled: true,
      stocks: {
        select: { quantity: true },
      },
    },
  });

  return NextResponse.json({
    data: materials.map((m) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      unit: m.unit,
      minStock: m.minStock,
      costCents: m.costCents,
      disabled: m.disabled,
      totalQuantity: m.stocks.reduce((sum, s) => sum + Number(s.quantity), 0),
    })),
  });
}

function getDefaultQuantity(unit: string): number {
  const upper = unit.toUpperCase();
  if (["UN", "PC", "CX", "PÇ", "PEC", "PEÇA"].includes(upper)) return 1000;
  if (["M", "MM", "CM", "KM", "KG", "G", "L", "ML"].includes(upper)) return 10000;
  return 1000; // fallback
}

async function getDefaultLocationId(tx: any) {
  // Find first enabled location (root level preferred)
  const location = await tx.location.findFirst({
    where: { disabled: false, parentId: null },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  if (location) return location.id;
  // Fallback: any enabled location
  const anyLoc = await tx.location.findFirst({
    where: { disabled: false },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  return anyLoc?.id ?? null;
}

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

  const existing = await prisma.material.findUnique({
    where: { code: parsed.data.code },
    select: { id: true, name: true },
  });
  if (existing) {
    return invalid(
      [{ field: "code", message: `Code "${parsed.data.code}" already exists` }],
      409,
    );
  }

  // Create material and default stock in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const material = await tx.material.create({
      data: {
        code: parsed.data.code,
        name: parsed.data.name,
        unit: parsed.data.unit,
        minStock: parsed.data.minStock,
        costCents: parsed.data.costCents,
        disabled: parsed.data.disabled,
      },
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        minStock: true,
        costCents: true,
        disabled: true,
      },
    });

    // Create default stock in the first/root location
    const defaultLocationId = await getDefaultLocationId(tx);
    if (defaultLocationId) {
      const defaultQty = getDefaultQuantity(parsed.data.unit);
      const position = await tx.stock.count({ where: { locationId: defaultLocationId } });
      await tx.stock.create({
        data: {
          materialId: material.id,
          locationId: defaultLocationId,
          quantity: defaultQty,
          position,
        },
      });
    }

    return material;
  });

  return NextResponse.json({ data: result }, { status: 201 });
}