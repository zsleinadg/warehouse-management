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
  locationId?: string | null;
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
      locationId: movement.locationId ?? undefined,
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

export interface OriginAllocation {
  locationId: string;
  taken: number;
}

/**
 * Where an issue took each material from, derived from its OUTBOUND
 * movements (newest origin tracking). Falls back to the locations holding
 * the most balance for old movements recorded without locationId.
 */
export async function getIssueOrigins(
  tx: LedgerTx,
  issueId: string,
): Promise<Map<string, OriginAllocation[]>> {
  const outbound = await tx.movement.findMany({
    where: { issueId, type: "OUTBOUND" },
    select: { materialId: true, quantity: true, locationId: true },
    orderBy: { createdAt: "asc" },
  });
  const byMaterial = new Map<string, OriginAllocation[]>();
  for (const m of outbound) {
    if (!m.locationId) continue;
    const list = byMaterial.get(m.materialId) ?? [];
    const slot = list.find((s) => s.locationId === m.locationId);
    if (slot) slot.taken += m.quantity;
    else list.push({ locationId: m.locationId, taken: m.quantity });
    byMaterial.set(m.materialId, list);
  }
  // Fallback for pre-tracking issues: top-balance location per material.
  const missing = new Set<string>();
  const withOrigins = new Set(byMaterial.keys());
  const allMaterials = [...new Set(outbound.map((m) => m.materialId))];
  for (const materialId of allMaterials) {
    if (!withOrigins.has(materialId)) missing.add(materialId);
  }
  for (const materialId of missing) {
    const top = await tx.stock.findFirst({
      where: { materialId, quantity: { gt: 0 } },
      orderBy: { quantity: "desc" },
      select: { locationId: true, quantity: true },
    });
    if (top) byMaterial.set(materialId, [{ locationId: top.locationId, taken: top.quantity }]);
  }
  return byMaterial;
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
