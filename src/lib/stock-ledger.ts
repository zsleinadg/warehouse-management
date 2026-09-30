import type { Prisma, PrismaClient } from "../../prisma/generated/client";
import type { MovementType } from "../../prisma/generated/client";

export type LedgerTx = Prisma.TransactionClient | PrismaClient;

export interface LedgerMovement {
  type: MovementType;
  quantity: number;
  materialId: string;
  userId?: string | null;
  destination?: string | null;
  nfNumber?: string | null;
  reason?: string | null;
  issueId?: string | null;
  returnId?: string | null;
}

/** Append one row to the immutable movement ledger. */
export async function recordMovement(tx: LedgerTx, movement: LedgerMovement) {
  return tx.movement.create({
    data: {
      type: movement.type,
      quantity: movement.quantity,
      materialId: movement.materialId,
      userId: movement.userId ?? undefined,
      destination: movement.destination ?? undefined,
      nfNumber: movement.nfNumber ?? undefined,
      reason: movement.reason ?? undefined,
      issueId: movement.issueId ?? undefined,
      returnId: movement.returnId ?? undefined,
    },
    select: { id: true },
  });
}

/** Add quantity to a material placement, creating it at the end when missing. */
export async function addStock(
  tx: LedgerTx,
  args: { materialId: string; locationId: string; quantity: number },
) {
  const position = await tx.stock.count({ where: { locationId: args.locationId } });
  return tx.stock.upsert({
    where: { materialId_locationId: { materialId: args.materialId, locationId: args.locationId } },
    update: { quantity: { increment: args.quantity } },
    create: {
      materialId: args.materialId,
      locationId: args.locationId,
      quantity: args.quantity,
      position,
    },
    select: { id: true, quantity: true },
  });
}

export interface Allocation {
  stockId: string;
  locationId: string;
  taken: number;
}

export class InsufficientBalanceError extends Error {
  available: number;
  materialId: string;
  constructor(materialId: string, available: number) {
    super(`Insufficient balance for material ${materialId}: available ${available}`);
    this.materialId = materialId;
    this.available = available;
  }
}

/**
 * Remove quantity consuming placements in position order (FIFO by layout).
 * Throws InsufficientBalanceError carrying the available balance.
 */
export async function removeStock(
  tx: LedgerTx,
  args: { materialId: string; quantity: number },
): Promise<Allocation[]> {
  const placements = await tx.stock.findMany({
    where: { materialId: args.materialId, quantity: { gt: 0 } },
    select: { id: true, locationId: true, quantity: true },
    orderBy: [{ locationId: "asc" }, { position: "asc" }],
  });
  const available = placements.reduce((sum, p) => sum + p.quantity, 0);
  if (available < args.quantity) {
    throw new InsufficientBalanceError(args.materialId, available);
  }

  const allocations: Allocation[] = [];
  let remaining = args.quantity;
  for (const placement of placements) {
    if (remaining <= 0) break;
    const taken = Math.min(placement.quantity, remaining);
    await tx.stock.update({
      where: { id: placement.id },
      data: { quantity: { decrement: taken } },
      select: { id: true },
    });
    allocations.push({ stockId: placement.id, locationId: placement.locationId, taken });
    remaining -= taken;
  }
  return allocations;
}

/** Total on-hand quantity of a material across every location. */
export async function totalOnHand(tx: LedgerTx, materialId: string): Promise<number> {
  const result = await tx.stock.aggregate({
    where: { materialId },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}

/**
 * Moving-average unit cost in cents after an inbound batch.
 * Pure helper so costing stays consistent across entry points.
 */
export function movingAverageCents(
  oldTotal: number,
  oldCostCents: number,
  batchQuantity: number,
  batchUnitCostCents: number,
): number {
  if (oldTotal + batchQuantity <= 0) return batchUnitCostCents;
  return Math.round(
    (oldTotal * oldCostCents + batchQuantity * batchUnitCostCents) / (oldTotal + batchQuantity),
  );
}
