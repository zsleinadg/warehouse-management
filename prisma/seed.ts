import { readFileSync } from "node:fs";
import { join } from "node:path";
import prisma from "../src/lib/prisma";
import { parseInventory } from "../src/lib/inventory-parser";

/**
 * Import the manual stock-taking (data/inventory.txt) preserving order.
 *
 * - Material is upserted by code; when the same code arrives with a
 *   different name, the first name wins and the stock is flagged with
 *   needsReview + a conflict note for manual audit.
 * - Locations are created from each entry path (parent chain), keeping
 *   sibling creation order in `position`.
 * - Stock position is the item index inside its location.
 * - Entries without a numeric code cannot satisfy Material.code @unique,
 *   so they are skipped and reported.
 * - Idempotent: re-running upserts the same rows (order may shift only
 *   if the source text is reordered).
 */
async function findOrCreateLocation(path: string[]): Promise<string> {
  let parentId: string | null = null;

  for (const name of path) {
    const existing: { id: string } | null = await prisma.location.findFirst({
      where: { name, parentId },
      select: { id: true },
    });
    if (existing) {
      parentId = existing.id;
      continue;
    }

    const siblings = await prisma.location.count({ where: { parentId } });
    const created: { id: string } = await prisma.location.create({
      data: { name, parentId, position: siblings },
      select: { id: true },
    });
    parentId = created.id;
  }

  if (!parentId) throw new Error("Empty location path");
  return parentId;
}

async function main(): Promise<void> {
  const text = readFileSync(join(__dirname, "..", "data", "inventory.txt"), "utf8");
  const entries = parseInventory(text);

  const locationIds = new Map<string, string>();
  const stockPosition = new Map<string, number>();
  let materials = 0;
  let locations = 0;
  let stocks = 0;
  let skipped = 0;
  let conflicts = 0;

  for (const entry of entries) {
    if (!entry.code) {
      skipped += 1;
      console.log(`SKIP (no code): ${entry.name}`);
      continue;
    }

    const material = await prisma.material.upsert({
      where: { code: entry.code },
      update: {},
      create: { code: entry.code, name: entry.name },
      select: { id: true, name: true },
    });
    materials += 1;

    let needsReview = entry.needsReview;
    let notes = entry.notes;
    if (material.name !== entry.name) {
      conflicts += 1;
      needsReview = true;
      const conflict = `name conflict: kept "${material.name}", saw "${entry.name}"`;
      notes = notes ? `${notes} | ${conflict}` : conflict;
      console.log(`CONFLICT ${entry.code}: ${conflict}`);
    }

    const pathKey = entry.path.join(">");
    let locationId = locationIds.get(pathKey);
    if (!locationId) {
      locationId = await findOrCreateLocation(entry.path);
      locationIds.set(pathKey, locationId);
      locations = locationIds.size;
    }

    const position = stockPosition.get(locationId) ?? 0;
    stockPosition.set(locationId, position + 1);

    await prisma.stock.upsert({
      where: {
        materialId_locationId: { materialId: material.id, locationId },
      },
      update: { quantity: entry.quantity, position, notes, needsReview },
      create: {
        materialId: material.id,
        locationId,
        quantity: entry.quantity,
        position,
        notes,
        needsReview,
      },
      select: { id: true },
    });
    stocks += 1;
  }

  console.log(
    `seed done: entries=${entries.length} materials=${materials} ` +
      `locations=${locations} stocks=${stocks} skipped=${skipped} conflicts=${conflicts}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
