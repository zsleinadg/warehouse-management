import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";
import { addStock, recordMovement } from "@/lib/stock-ledger";

const itemSchema = z.object({
  materialId: z.uuid("Invalid material"),
  locationId: z.uuid("Invalid location"),
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

  const locationIds = [...new Set(parsed.data.items.map((item) => item.locationId))];
  const [materials, locations] = await Promise.all([
    prisma.material.findMany({
      where: { id: { in: parsed.data.items.map((item) => item.materialId) } },
      select: { id: true, code: true, disabled: true },
    }),
    prisma.location.findMany({
      where: { id: { in: locationIds } },
      select: { id: true, name: true, disabled: true },
    }),
  ]);
  const materialById = new Map(materials.map((m) => [m.id, m]));
  const locationById = new Map(locations.map((l) => [l.id, l]));

  // Teto agregado por material (várias linhas do mesmo material somam) e
  // @@unique([returnId, materialId, locationId]): mesma dupla material+local
  // em duas linhas estouraria P2002 — devolva 409 em vez de 500.
  const requestedByMaterial = new Map<string, number>();
  const seenPairs = new Set<string>();
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
    const location = locationById.get(item.locationId);
    if (!location || location.disabled) {
      return invalid(
        [{ field: `items.${index}.locationId`, message: "Location not found or disabled" }],
        404,
      );
    }
    const returnable =
      (fulfilledByMaterial.get(item.materialId) ?? 0) - (alreadyReturned.get(item.materialId) ?? 0);
    const requestedSoFar = requestedByMaterial.get(item.materialId) ?? 0;
    if (requestedSoFar + item.quantity > returnable) {
      return invalid(
        [
          {
            field: `items.${index}.quantity`,
            message: `Only ${returnable} of "${material.code}" can still be returned from issue #${issue.number}`,
          },
        ],
        409,
      );
    }
    requestedByMaterial.set(item.materialId, requestedSoFar + item.quantity);
    const pairKey = `${item.materialId}::${item.locationId}`;
    if (seenPairs.has(pairKey)) {
      return invalid(
        [
          {
            field: `items.${index}`,
            message: "Duplicate material in the same location — merge into a single line",
          },
        ],
        409,
      );
    }
    seenPairs.add(pairKey);
  }

  const created = await prisma.$transaction(async (tx) => {
    const ret = await tx.return.create({
      data: {
        issueId: issue.id,
        reason: parsed.data.reason,
        userId: auth.user.userId,
        items: {
          create: parsed.data.items.map((item) => ({
            materialId: item.materialId,
            locationId: item.locationId,
            quantity: item.quantity,
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

    for (const item of parsed.data.items) {
      await addStock(tx, {
        materialId: item.materialId,
        locationId: item.locationId,
        quantity: item.quantity,
      });
      await recordMovement(tx, {
        type: "RETURN",
        quantity: item.quantity,
        materialId: item.materialId,
        userId: auth.user.userId,
        destination: issue.ot ?? issue.destination,
        reason: parsed.data.reason,
        issueId: issue.id,
        returnId: ret.id,
        locationId: item.locationId,
      });
    }
    return ret;
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
