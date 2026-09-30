import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

const createSchema = z.object({
  locationId: z.uuid("Invalid location"),
  code: z.string().trim().min(1, "Code is required").max(64),
  name: z.string().trim().min(1, "Name is required").max(200),
  quantity: z.coerce.number().int().min(0).default(0),
});

function invalid(issues: { field: string; message: string }[], status: number) {
  return NextResponse.json({ errors: issues }, { status });
}

/** Place an item in a location (appends at the end). Operators and admins only. */
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

  const location = await prisma.location.findFirst({
    where: { id: parsed.data.locationId, disabled: false },
    select: { id: true },
  });
  if (!location) {
    return invalid([{ field: "locationId", message: "Location not found" }], 404);
  }

  const existing = await prisma.material.findUnique({
    where: { code: parsed.data.code },
    select: { id: true, name: true },
  });
  if (existing && existing.name !== parsed.data.name) {
    return invalid(
      [
        {
          field: "code",
          message: `Code already exists as "${existing.name}"`,
        },
      ],
      409,
    );
  }

  const material =
    existing ??
    (await prisma.material.create({
      data: { code: parsed.data.code, name: parsed.data.name },
      select: { id: true, name: true },
    }));

  const position = await prisma.stock.count({
    where: { locationId: location.id },
  });

  const stock = await prisma.stock.upsert({
    where: {
      materialId_locationId: { materialId: material.id, locationId: location.id },
    },
    update: { quantity: parsed.data.quantity },
    create: {
      materialId: material.id,
      locationId: location.id,
      quantity: parsed.data.quantity,
      position,
    },
    select: {
      id: true,
      quantity: true,
      position: true,
      material: { select: { code: true, name: true } },
    },
  });

  return NextResponse.json({ data: stock }, { status: 201 });
}
