import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";
import { addStock, InsufficientBalanceError, recordMovement, removeStock, totalOnHand } from "@/lib/stock-ledger";

const returnTargetSchema = z.object({
  materialId: z.uuid("Invalid material"),
  locationId: z.uuid("Invalid location"),
});

const actionSchema = z.object({
  action: z.enum(["close", "cancel", "cancel-closed"], "Action must be close, cancel or cancel-closed"),
  reason: z.string().trim().max(500).optional(),
  returnsTo: z.array(returnTargetSchema).max(200).optional(),
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

  return NextResponse.json({ data: issue });
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
    const fulfilled = issue.items.filter((item) => item.fulfilledQuantity > 0);
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
      }
    }

    const reason = `OT cancelada: ${parsed.data.reason.trim()}`;
    const reverted = await prisma.$transaction(async (tx) => {
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
          quantity: item.fulfilledQuantity,
        });
        await recordMovement(tx, {
          type: "RETURN",
          quantity: item.fulfilledQuantity,
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
    });

    return NextResponse.json({ data: reverted });
  }

  if (issue.status !== "DRAFT") {
    return invalid(
      [{ field: "status", message: `Only draft issues can change, current status is ${issue.status}` }],
      409,
    );
  }

  const pending = issue.items.filter((item) => item.fulfilledQuantity < item.quantity);
  const balances = await Promise.all(
    pending.map(async (item) => ({
      item,
      available: await totalOnHand(prisma, item.materialId),
    })),
  );
  if (balances.every(({ available }) => available <= 0)) {
    return NextResponse.json(
      {
        errors: [{ field: "items", message: "No balance available for any pending item" }],
        data: balances.map(({ item, available }) => ({
          materialId: item.materialId,
          requested: item.quantity - item.fulfilledQuantity,
          available,
        })),
      },
      { status: 409 },
    );
  }

  let closed;
  try {
    closed = await prisma.$transaction(async (tx) => {
    for (const { item, available } of balances) {
      const missing = item.quantity - item.fulfilledQuantity;
      const fulfill = Math.min(missing, available);
      if (fulfill <= 0) continue;
      const allocations = await removeStock(tx, { materialId: item.materialId, quantity: fulfill });
      for (const allocation of allocations) {
        await recordMovement(tx, {
          type: "OUTBOUND",
          quantity: allocation.taken,
          materialId: item.materialId,
          userId: auth.user.userId,
          destination: issue.ot ?? issue.destination,
          nfNumber: issue.nfNumber ?? undefined,
          issueId: issue.id,
          locationId: allocation.locationId,
        });
      }
      await tx.issueItem.update({
        where: { id: item.id },
        data: { fulfilledQuantity: { increment: fulfill } },
        select: { id: true },
      });
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
    });
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
