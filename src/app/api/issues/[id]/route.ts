import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";
import { addStock, getIssueOrigins, InsufficientBalanceError, recordMovement, recordMovements, removeStock, totalOnHand } from "@/lib/stock-ledger";
import { assertPlaceable } from "@/lib/locations";

function toNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return val;
  return Number(val);
}

const returnTargetSchema = z.object({
  materialId: z.uuid("Invalid material"),
  locationId: z.uuid("Invalid location"),
});

const fulfilledQuantitySchema = z.object({
  itemId: z.uuid("Invalid item"),
  quantity: z.coerce.number().min(0, "Quantity cannot be negative"),
});

const actionSchema = z.object({
  action: z.enum(["close", "cancel", "cancel-closed"], "Action must be close, cancel or cancel-closed"),
  reason: z.string().trim().max(500).optional(),
  returnsTo: z.array(returnTargetSchema).max(200).optional(),
  fulfilledQuantities: z.array(fulfilledQuantitySchema).max(200).optional(),
});

function invalid(issues: { field: string; message: string }[], status: number) {
  return NextResponse.json({ errors: issues }, { status });
}

/** Issue detail with requested vs fulfilled quantities per item. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const issue = await prisma.issue.findUnique({
    where: { id },
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
      cancelReason: true,
      cancelledAt: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { name: true } },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          quantity: true,
          fulfilledQuantity: true,
          isExtra: true,
          createdAt: true,
          material: { select: { id: true, code: true, name: true, unit: true } },
          additions: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              quantity: true,
              createdAt: true,
              user: { select: { name: true } },
            },
          },
        },
      },
      returns: {
        select: { id: true, number: true, reason: true, createdAt: true },
      },
    },
  });
  if (!issue) {
    return invalid([{ field: "id", message: "Issue not found" }], 404);
  }

  // Where each material left from (for returns): origin locations + taken.
  const origins = await getIssueOrigins(prisma, issue.id);
  const originLocationIds = [...new Set([...origins.values()].flatMap((list) => list.map((o) => o.locationId)))];
  const originLocations = await prisma.location.findMany({
    where: { id: { in: originLocationIds } },
    select: { id: true, name: true, parentId: true },
  });
  const originNameById = new Map(originLocations.map((l) => [l.id, l]));
  const originList: { materialId: string; locationId: string; locationName: string; taken: number }[] = [];
  for (const [materialId, list] of origins) {
    for (const origin of list) {
      const loc = originNameById.get(origin.locationId);
      originList.push({
        materialId,
        locationId: origin.locationId,
        locationName: loc?.name ?? origin.locationId,
        taken: origin.taken,
      });
    }
  }

  return NextResponse.json({ data: { ...issue, origins: originList } });
}

/**
 * Close a draft issue: every item is fulfilled up to the available balance
 * (partial fulfillment allowed, remainder stays pending on the issue) and
 * OUTBOUND movements are recorded per origin location. Cancel voids drafts
 * (nothing moved) recording the reason. Cancel-closed reverses a fulfilled
 * issue, returning every fulfilled unit to the informed locations.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR"]);
  if ("response" in auth) return auth.response;

  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
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
  const issue = await prisma.issue.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      ot: true,
      nfNumber: true,
      destination: true,
      status: true,
      items: {
        select: { id: true, materialId: true, quantity: true, fulfilledQuantity: true },
      },
    },
  });
  if (!issue) {
    return invalid([{ field: "id", message: "Issue not found" }], 404);
  }

  if (parsed.data.action === "cancel") {
    if (issue.status !== "DRAFT") {
      return invalid(
        [{ field: "status", message: `Only draft issues can be cancelled, current status is ${issue.status}` }],
        409,
      );
    }
    if (!parsed.data.reason?.trim()) {
      return invalid(
        [{ field: "reason", message: "A reason is required to cancel (ex.: obra cancelada antes da retirada)" }],
        400,
      );
    }
    const cancelled = await prisma.issue.update({
      where: { id },
      data: { status: "CANCELLED", cancelReason: parsed.data.reason.trim(), cancelledAt: new Date() },
      select: { id: true, number: true, status: true, cancelReason: true, cancelledAt: true },
    });
    return NextResponse.json({ data: cancelled });
  }

  if (parsed.data.action === "cancel-closed") {
    if (issue.status !== "CLOSED") {
      return invalid(
        [{ field: "status", message: `Only closed issues can be reverted, current status is ${issue.status}` }],
        409,
      );
    }
    if (!parsed.data.reason?.trim()) {
      return invalid(
        [{ field: "reason", message: "A reason is required to revert a closed issue" }],
        400,
      );
    }
    const fulfilled = issue.items.filter((item) => toNum(item.fulfilledQuantity) > 0);
    if (fulfilled.length === 0) {
      return invalid(
        [{ field: "items", message: "Nothing was fulfilled, use cancel on a draft instead" }],
        409,
      );
    }
    const targetByMaterial = new Map(
      (parsed.data.returnsTo ?? []).map((t) => [t.materialId, t.locationId]),
    );
    const locationIds = [...new Set(targetByMaterial.values())];
    if (locationIds.length > 0) {
      const locations = await prisma.location.findMany({
        where: { id: { in: locationIds }, disabled: false },
        select: { id: true },
      });
      const valid = new Set(locations.map((l) => l.id));
      for (const [materialId, locationId] of targetByMaterial) {
        if (!valid.has(locationId)) {
          return invalid(
            [{ field: "returnsTo", message: `Invalid return location for material ${materialId}` }],
            404,
          );
        }
        const placeable = await assertPlaceable(prisma, locationId, materialId);
        if (!placeable.ok) {
          return invalid([{ field: "returnsTo", message: placeable.reason }], 409);
        }
      }
    }

    const reason = `OT cancelada: ${parsed.data.reason.trim()}`;
    const reverted = await prisma.$transaction(
      async (tx) => {
        for (const item of fulfilled) {
          let locationId = targetByMaterial.get(item.materialId);
          if (!locationId) {
            // Sem local informado: devolve onde há mais saldo do material.
            const top = await tx.stock.findFirst({
              where: { materialId: item.materialId },
              orderBy: { quantity: "desc" },
              select: { locationId: true },
            });
            locationId = top?.locationId;
            if (!locationId) {
              const first = await tx.location.findFirst({
                where: { disabled: false },
                orderBy: { createdAt: "asc" },
                select: { id: true },
              });
              if (!first) {
                throw new Error("No location available for return");
              }
              locationId = first.id;
            }
          }
          await addStock(tx, {
            materialId: item.materialId,
            locationId,
            quantity: toNum(item.fulfilledQuantity),
          });
          await recordMovement(tx, {
            type: "RETURN",
            quantity: toNum(item.fulfilledQuantity),
            materialId: item.materialId,
            userId: auth.user.userId,
            destination: issue.ot ?? issue.destination,
            nfNumber: issue.nfNumber ?? undefined,
          reason,
          issueId: issue.id,
          locationId,
        });
      }
      return tx.issue.update({
        where: { id },
        data: { status: "CANCELLED", cancelReason: parsed.data.reason?.trim(), cancelledAt: new Date() },
        select: { id: true, number: true, status: true, cancelReason: true, cancelledAt: true },
      });
    },
    { timeout: 60000 },
  );

  return NextResponse.json({ data: reverted });
  }

  if (issue.status !== "DRAFT") {
    return invalid(
      [{ field: "status", message: `Only draft issues can change, current status is ${issue.status}` }],
      409,
    );
  }

  const userFulfilledQuantities = parsed.data.fulfilledQuantities ?? [];
  const userFulfilledMap = new Map(userFulfilledQuantities.map((f) => [f.itemId, f.quantity]));

  // Validate user-provided quantities if any
  if (userFulfilledQuantities.length > 0) {
    const itemIds = issue.items.map((i) => i.id);
    for (const fq of userFulfilledQuantities) {
      if (!itemIds.includes(fq.itemId)) {
        return invalid(
          [{ field: "fulfilledQuantities", message: `Item ${fq.itemId} not found in this issue` }],
          404,
        );
      }
      const item = issue.items.find((i) => i.id === fq.itemId)!;
      const maxAllowed = toNum(item.quantity);
      if (fq.quantity > maxAllowed) {
        return invalid(
          [{ field: "fulfilledQuantities", message: `Quantidade atendida (${fq.quantity}) não pode exceder o pedido (${maxAllowed})` }],
          400,
        );
      }
    }
  }

  // Check stock availability for items that will be fulfilled
  const itemsToFulfill = issue.items.filter((item) => {
    const userQty = userFulfilledMap.get(item.id);
    const currentFulfilled = toNum(item.fulfilledQuantity);
    const targetQty = userQty !== undefined ? userQty : toNum(item.quantity);
    return targetQty > currentFulfilled;
  });

  const balances = await Promise.all(
    itemsToFulfill.map(async (item) => {
      const userQty = userFulfilledMap.get(item.id);
      const currentFulfilled = toNum(item.fulfilledQuantity);
      const targetQty = userQty !== undefined ? userQty : toNum(item.quantity);
      const needed = targetQty - currentFulfilled;
      const available = await totalOnHand(prisma, item.materialId);
      return { item, needed, available };
    }),
  );

  if (balances.every(({ available }) => available <= 0)) {
    return NextResponse.json(
      {
        errors: [{ field: "items", message: "No balance available for any pending item" }],
        data: balances.map(({ item, needed, available }) => ({
          materialId: item.materialId,
          requested: needed,
          available,
        })),
      },
      { status: 409 },
    );
  }

  // Check if any item has insufficient stock
  for (const { item, needed, available } of balances) {
    if (needed > available) {
      return invalid(
        [
          {
            field: "items",
            message: `Saldo insuficiente para ${item.materialId}: solicitado ${needed}, disponível ${available}`,
          },
        ],
        409,
      );
    }
  }

  let closed;
  try {
    closed = await prisma.$transaction(
      async (tx) => {
        // Collect all movements to batch create at the end
        const movementsToCreate: Array<{
          type: "OUTBOUND";
          quantity: number;
          materialId: string;
          userId: string;
          destination: string | null;
          nfNumber: string | null;
          issueId: string;
          locationId: string;
        }> = [];

        for (const { item, needed } of balances) {
          if (needed <= 0) continue;
          const allocations = await removeStock(tx, { materialId: item.materialId, quantity: needed });
          for (const allocation of allocations) {
            movementsToCreate.push({
              type: "OUTBOUND",
              quantity: allocation.taken,
              materialId: item.materialId,
              userId: auth.user.userId,
              destination: issue.ot ?? issue.destination,
              nfNumber: issue.nfNumber ?? null,
              issueId: issue.id,
              locationId: allocation.locationId,
            });
          }
          await tx.issueItem.update({
            where: { id: item.id },
            data: { fulfilledQuantity: { increment: needed } },
            select: { id: true },
          });
        }

        // Batch create all movements at once
        if (movementsToCreate.length > 0) {
          await recordMovements(tx, movementsToCreate);
        }
        return tx.issue.update({
          where: { id },
          data: { status: "CLOSED" },
          select: {
            id: true,
            number: true,
            ot: true,
            destination: true,
            status: true,
            items: {
              select: {
                quantity: true,
                fulfilledQuantity: true,
                material: { select: { code: true, name: true, unit: true } },
              },
            },
          },
        });
      },
      { timeout: 60000 }, // 60s timeout for large OTs with many items
    );
  } catch (err) {
    // Corrida com outro fechamento/baixa: o saldo lido antes da transação
    // evaporou. 409 tratável em vez de 500.
    if (err instanceof InsufficientBalanceError) {
      return invalid(
        [
          {
            field: "items",
            message: `Saldo insuficiente no fechamento (disponível agora: ${err.available}). Tente de novo — a OT atende o parcial possível.`,
          },
        ],
        409,
      );
    }
    throw err;
  }

  return NextResponse.json({ data: closed });
}
