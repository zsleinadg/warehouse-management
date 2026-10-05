import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";
import { addStock, getIssueOrigins, recordMovement } from "@/lib/stock-ledger";
import { assertPlaceable } from "@/lib/locations";

const itemSchema = z.object({
  materialId: z.uuid("Invalid material"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
});

const createSchema = z.object({
  issueId: z.uuid("Invalid origin issue"),
  reason: z.string().trim().min(1, "Reason is required").max(500),
  items: z.array(itemSchema).min(1, "At least one item is required").max(200),
});

function invalid(issues: { field: string; message: string }[], status: number) {
  return NextResponse.json({ errors: issues }, { status });
}

/** List returns (goods coming back from OTs/sites), newest first. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR"]);
  if ("response" in auth) return auth.response;

  const returns = await prisma.return.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      number: true,
      reason: true,
      createdAt: true,
      issue: { select: { number: true, ot: true, destination: true } },
      user: { select: { name: true } },
      items: {
        select: {
          quantity: true,
          material: { select: { code: true, name: true, unit: true } },
          location: { select: { name: true } },
        },
      },
    },
  });

  return NextResponse.json({ data: returns });
}

/**
 * Register a return linked to its origin issue. Quantities are capped by
 * what the issue actually fulfilled minus previous returns, then added back
 * to the informed locations with RETURN movements.
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

  const issue = await prisma.issue.findUnique({
    where: { id: parsed.data.issueId },
    select: {
      id: true,
      number: true,
      ot: true,
      destination: true,
      status: true,
      items: { select: { materialId: true, fulfilledQuantity: true } },
      returns: {
        select: { items: { select: { materialId: true, quantity: true } } },
      },
    },
  });
  if (!issue) {
    return invalid([{ field: "issueId", message: "Origin issue not found" }], 404);
  }
  if (issue.status !== "CLOSED") {
    return invalid(
      [{ field: "issueId", message: "Only closed issues accept returns" }],
      409,
    );
  }

  const fulfilledByMaterial = new Map(
    issue.items.map((item) => [item.materialId, item.fulfilledQuantity]),
  );
  const alreadyReturned = new Map<string, number>();
  for (const ret of issue.returns) {
    for (const item of ret.items) {
      alreadyReturned.set(item.materialId, (alreadyReturned.get(item.materialId) ?? 0) + item.quantity);
    }
  }

  // Merge duplicate material lines by summing (one line per material).
  const merged = new Map<string, number>();
  for (const item of parsed.data.items) {
    merged.set(item.materialId, (merged.get(item.materialId) ?? 0) + item.quantity);
  }

  const materials = await prisma.material.findMany({
    where: { id: { in: [...merged.keys()] } },
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
  for (const [materialId, quantity] of merged) {
    const material = materialById.get(materialId);
    const returnable =
      (fulfilledByMaterial.get(materialId) ?? 0) - (alreadyReturned.get(materialId) ?? 0);
    if (quantity > returnable) {
      return invalid(
        [
          {
            field: "items",
            message: `Only ${returnable} of "${material?.code ?? materialId}" can still be returned from issue #${issue.number}`,
          },
        ],
        409,
      );
    }
  }

  // Every unit goes back where it left from (FIFO across origin locations).
  const origins = await getIssueOrigins(prisma, issue.id);
  interface Split {
    materialId: string;
    locationId: string;
    quantity: number;
  }
  const splits: Split[] = [];
  for (const [materialId, quantity] of merged) {
    let remaining = quantity;
    for (const origin of origins.get(materialId) ?? []) {
      if (remaining <= 0) break;
      const take = Math.min(origin.taken, remaining);
      if (take <= 0) continue;
      splits.push({ materialId, locationId: origin.locationId, quantity: take });
      remaining -= take;
    }
    if (remaining > 0) {
      // Origin unknown or placement gone: fall back to top-balance location.
      const top = await prisma.stock.findFirst({
        where: { materialId, quantity: { gt: 0 } },
        orderBy: { quantity: "desc" },
        select: { locationId: true },
      });
      const fallbackId =
        top?.locationId ??
        (
          await prisma.location.findFirst({
            where: { disabled: false },
            orderBy: { createdAt: "asc" },
            select: { id: true },
          })
        )?.id;
      if (!fallbackId) {
        return invalid([{ field: "items", message: "No location available for return" }], 409);
      }
      splits.push({ materialId, locationId: fallbackId, quantity: remaining });
    }
  }

  const splitLocationIds = [...new Set(splits.map((s) => s.locationId))];
  const splitLocations = await prisma.location.findMany({
    where: { id: { in: splitLocationIds } },
    select: { id: true, name: true, disabled: true },
  });
  const splitLocationById = new Map(splitLocations.map((l) => [l.id, l]));
  for (const split of splits) {
    const location = splitLocationById.get(split.locationId);
    if (!location || location.disabled) {
      return invalid([{ field: "items", message: "Return location not found or disabled" }], 409);
    }
    const placeable = await assertPlaceable(prisma, location.id, split.materialId);
    if (!placeable.ok) {
      return invalid([{ field: "items", message: placeable.reason }], 409);
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const ret = await tx.return.create({
      data: {
        issueId: issue.id,
        reason: parsed.data.reason,
        userId: auth.user.userId,
        items: {
          create: splits.map((split) => ({
            materialId: split.materialId,
            locationId: split.locationId,
            quantity: split.quantity,
          })),
        },
      },
      select: {
        id: true,
        number: true,
        reason: true,
        createdAt: true,
        items: {
          select: {
            quantity: true,
            material: { select: { code: true, name: true, unit: true } },
            location: { select: { id: true, name: true } },
          },
        },
      },
    });

    for (const split of splits) {
      await addStock(tx, {
        materialId: split.materialId,
        locationId: split.locationId,
        quantity: split.quantity,
      });
      await recordMovement(tx, {
        type: "RETURN",
        quantity: split.quantity,
        materialId: split.materialId,
        userId: auth.user.userId,
        destination: issue.ot ?? issue.destination,
        reason: parsed.data.reason,
        issueId: issue.id,
        returnId: ret.id,
        locationId: split.locationId,
      });
    }
    return ret;
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
