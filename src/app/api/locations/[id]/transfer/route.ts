import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";
import { assertPlaceable } from "@/lib/locations";

const transferSchema = z.object({
  toLocationId: z.uuid("Invalid destination"),
  materialIds: z.array(z.uuid("Invalid material")).min(1, "Select at least one material").max(200),
});

function invalid(issues: { field: string; message: string }[], status: number) {
  return NextResponse.json({ errors: issues }, { status });
}

/**
 * Move whole placements to another location (e.g. parent level into a
 * child). Quantities merge into the destination placement; notes and review
 * flags carry over to newly created rows. No ledger movement is recorded:
 * this is addressing, not stock in/out.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR"]);
  if ("response" in auth) return auth.response;

  const parsed = transferSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return invalid(
      parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      })),
      400,
    );
  }

  const { id } = await params;
  if (parsed.data.toLocationId === id) {
    return invalid(
      [{ field: "toLocationId", message: "Destination must differ from origin" }],
      409,
    );
  }

  const [source, target] = await Promise.all([
    prisma.location.findUnique({
      where: { id },
      select: { id: true, name: true },
    }),
    prisma.location.findFirst({
      where: { id: parsed.data.toLocationId, disabled: false },
      select: { id: true, name: true },
    }),
  ]);
  if (!source) {
    return invalid([{ field: "id", message: "Origin location not found" }], 404);
  }
  if (!target) {
    return invalid([{ field: "toLocationId", message: "Destination not found or disabled" }], 404);
  }

  const materialIds = [...new Set(parsed.data.materialIds)];
  const placements = await prisma.stock.findMany({
    where: { locationId: source.id, materialId: { in: materialIds } },
    select: {
      id: true,
      quantity: true,
      notes: true,
      needsReview: true,
      material: { select: { id: true, code: true, name: true } },
    },
  });
  const foundIds = new Set(placements.map((p) => p.material.id));
  const missing = materialIds.filter((mid) => !foundIds.has(mid));
  if (missing.length > 0) {
    return invalid(
      [{ field: "materialIds", message: `${missing.length} material(s) not placed here` }],
      404,
    );
  }
  for (const placement of placements) {
    const placeable = await assertPlaceable(prisma, target.id, placement.material.id);
    if (!placeable.ok) {
      return invalid(
        [{ field: "toLocationId", message: `"${placement.material.code}": ${placeable.reason}` }],
        409,
      );
    }
  }

  const moved = await prisma.$transaction(async (tx) => {
    const result = [];
    for (const placement of placements) {
      const position = await tx.stock.count({ where: { locationId: target.id } });
      await tx.stock.upsert({
        where: {
          materialId_locationId: { materialId: placement.material.id, locationId: target.id },
        },
        update: { quantity: { increment: placement.quantity } },
        create: {
          materialId: placement.material.id,
          locationId: target.id,
          quantity: placement.quantity,
          position,
          notes: placement.notes,
          needsReview: placement.needsReview,
        },
        select: { id: true },
      });
      await tx.stock.delete({ where: { id: placement.id }, select: { id: true } });
      result.push({
        code: placement.material.code,
        name: placement.material.name,
        quantity: placement.quantity,
      });
    }
    return result;
  });

  return NextResponse.json({
    data: { from: source.name, to: target.name, moved },
  });
}
