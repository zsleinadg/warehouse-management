import type { Prisma, PrismaClient } from "../../prisma/generated/client";

type Db = PrismaClient | Prisma.TransactionClient;

export interface FlatLocation {
  id: string;
  parentId: string | null;
}

/** Leaf = location with no active children. New placements go on leaves only. */
export async function isLeafLocation(db: Db, locationId: string): Promise<boolean> {
  const child = await db.location.findFirst({
    where: { parentId: locationId, disabled: false },
    select: { id: true },
  });
  return child === null;
}

/** All active descendant ids of a location (empty when leaf). */
export async function getDescendantIds(db: Db, rootId: string): Promise<string[]> {
  const all = await db.location.findMany({
    where: { disabled: false },
    select: { id: true, parentId: true },
  });
  const byParent = new Map<string, string[]>();
  for (const loc of all) {
    if (!loc.parentId) continue;
    const list = byParent.get(loc.parentId) ?? [];
    list.push(loc.id);
    byParent.set(loc.parentId, list);
  }
  const result: string[] = [];
  const stack = [...(byParent.get(rootId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    result.push(id);
    stack.push(...(byParent.get(id) ?? []));
  }
  return result;
}

/** Stock counts on the location itself and across its active subtree. */
export async function subtreeStockCount(
  db: Db,
  rootId: string,
): Promise<{ own: number; descendants: number }> {
  const ids = await getDescendantIds(db, rootId);
  const [own, descendants] = await Promise.all([
    db.stock.count({ where: { locationId: rootId } }),
    ids.length > 0 ? db.stock.count({ where: { locationId: { in: ids } } }) : Promise.resolve(0),
  ]);
  return { own, descendants };
}

/** Whether a placement of this material already exists (merge keeps working). */
export async function locationHasMaterial(
  db: Db,
  locationId: string,
  materialId: string,
): Promise<boolean> {
  const existing = await db.stock.findUnique({
    where: { materialId_locationId: { materialId, locationId } },
    select: { id: true },
  });
  return existing !== null;
}

/**
 * New plaques go on leaves only; merging into an existing placement stays
 * allowed so grandfathered (pre-leaf-rule) addresses keep working.
 */
export async function assertPlaceable(
  db: Db,
  locationId: string,
  materialId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (await isLeafLocation(db, locationId)) return { ok: true };
  if (await locationHasMaterial(db, locationId, materialId)) return { ok: true };
  return {
    ok: false,
    reason: "Location is not a leaf — link materials on leaf levels only (existing placements keep working)",
  };
}

/**
 * Whether newParentId is a legal parent for nodeId: not itself and not one
 * of its own descendants (that would cycle the tree).
 */
export async function isValidNewParent(
  db: Db,
  nodeId: string,
  newParentId: string,
): Promise<boolean> {
  if (newParentId === nodeId) return false;
  let currentId: string | null = newParentId;
  while (currentId) {
    if (currentId === nodeId) return false;
    const current: { parentId: string | null } | null = await db.location.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });
    if (!current) return true;
    currentId = current.parentId;
  }
  return true;
}
