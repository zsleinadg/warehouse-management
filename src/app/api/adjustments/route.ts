import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";
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

  // Single pre-read outside the transaction: per-item awaits inside an
  // interactive transaction exceed the 5s default over pooled latency
  // (P2028) once a count has more than a handful of lines.
  const existingStocks = await prisma.stock.findMany({
    where: {
      locationId: location.id,
      materialId: { in: parsed.data.items.map((item) => item.materialId) },
    },
    select: { id: true, materialId: true, quantity: true },
  });
  const stockByMaterial = new Map(existingStocks.map((s) => [s.materialId, s]));

  const divergent = [];
  for (const item of parsed.data.items) {
    const systemQuantity = stockByMaterial.get(item.materialId)?.quantity ?? 0;
    const difference = item.countedQuantity - systemQuantity;
    if (difference !== 0) {
      divergent.push({ item, systemQuantity, difference });
    }
  }

  let adjustments: { materialId: string; systemQuantity: number; countedQuantity: number; difference: number; position: number }[] = [];
  if (divergent.length > 0) {
    const basePosition = await prisma.stock.count({ where: { locationId: location.id } });
    adjustments = divergent.map(({ item, systemQuantity, difference }, i) => ({
      materialId: item.materialId,
      systemQuantity,
      countedQuantity: item.countedQuantity,
      difference,
      position: basePosition + i,
    }));

    // One batched transaction instead of N sequential round-trips.
    await prisma.$transaction(
      adjustments.flatMap((adj) => {
        const stock = stockByMaterial.get(adj.materialId);
        const write = stock
          ? prisma.stock.update({
              where: { id: stock.id },
              data: { quantity: adj.countedQuantity },
              select: { id: true },
            })
          : prisma.stock.create({
              data: {
                materialId: adj.materialId,
                locationId: location.id,
                quantity: adj.countedQuantity,
                position: adj.position,
              },
              select: { id: true },
            });
        const movement = prisma.movement.create({
          data: {
            type: "ADJUSTMENT",
            quantity: adj.difference,
            materialId: adj.materialId,
            userId: auth.user.userId,
            destination: location.name,
            reason: parsed.data.reason,
            locationId: location.id,
          },
          select: { id: true },
        });
        return [write, movement];
      }),
      { maxWait: 15000, timeout: 60000 },
    );
  }

  const result = adjustments.map(({ materialId, systemQuantity, countedQuantity, difference }) => ({
    materialId,
    systemQuantity,
    countedQuantity,
    difference,
  }));

  return NextResponse.json(
    { data: { locationId: location.id, locationName: location.name, adjustments: result } },
    { status: 201 },
  );
}
