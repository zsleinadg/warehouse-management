import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";
import { recordMovement } from "@/lib/stock-ledger";
import { assertPlaceable } from "@/lib/locations";

const itemSchema = z.object({
  materialId: z.uuid("Invalid material"),
  countedQuantity: z.coerce.number().int().min(0, "Counted quantity cannot be negative"),
});

const createSchema = z.object({
  locationId: z.uuid("Invalid location"),
  reason: z.string().trim().min(1, "Reason is required").max(500),
  items: z.array(itemSchema).min(1, "At least one counted item is required").max(200),
});

function invalid(issues: { field: string; message: string }[], status: number) {
  return NextResponse.json({ errors: issues }, { status });
}

/**
 * Post a cycle count for one location. Every divergence between system and
 * counted quantity becomes an ADJUSTMENT movement (signed: positive for
 * found surplus, negative for shortage) with a mandatory reason.
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

  const [location, materials] = await Promise.all([
    prisma.location.findFirst({
      where: { id: parsed.data.locationId, disabled: false },
      select: { id: true, name: true },
    }),
    prisma.material.findMany({
      where: { id: { in: parsed.data.items.map((item) => item.materialId) } },
      select: { id: true, code: true, disabled: true },
    }),
  ]);
  if (!location) {
    return invalid([{ field: "locationId", message: "Location not found" }], 404);
  }
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
    const placeable = await assertPlaceable(prisma, location.id, item.materialId);
    if (!placeable.ok) {
      return invalid([{ field: "locationId", message: placeable.reason }], 409);
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const adjustments = [];
    for (const item of parsed.data.items) {
      const stock = await tx.stock.findUnique({
        where: {
          materialId_locationId: { materialId: item.materialId, locationId: location.id },
        },
        select: { id: true, quantity: true },
      });
      const systemQuantity = stock?.quantity ?? 0;
      const difference = item.countedQuantity - systemQuantity;
      if (difference === 0) continue;

      if (stock) {
        await tx.stock.update({
          where: { id: stock.id },
          data: { quantity: item.countedQuantity },
          select: { id: true },
        });
      } else {
        const position = await tx.stock.count({ where: { locationId: location.id } });
        await tx.stock.create({
          data: {
            materialId: item.materialId,
            locationId: location.id,
            quantity: item.countedQuantity,
            position,
          },
          select: { id: true },
        });
      }
      await recordMovement(tx, {
        type: "ADJUSTMENT",
        quantity: difference,
        materialId: item.materialId,
        userId: auth.user.userId,
        destination: location.name,
        reason: parsed.data.reason,
        locationId: location.id,
      });
      adjustments.push({
        materialId: item.materialId,
        systemQuantity,
        countedQuantity: item.countedQuantity,
        difference,
      });
    }
    return adjustments;
  });

  return NextResponse.json(
    { data: { locationId: location.id, locationName: location.name, adjustments: result } },
    { status: 201 },
  );
}
