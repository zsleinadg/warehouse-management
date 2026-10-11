import { existsSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import prisma from "../src/lib/prisma";

const SOURCE = join(__dirname, "..", "data", "recebimento-blct.xlsx");
const SHEET = "BANCO DE DADOS";
const BATCH_SIZE = 500;

interface CatalogRow {
  code: string;
  plant: string;
  name: string;
  storageLocation: string;
  unit: string;
}

interface Conflict {
  code: string;
  plant: string;
  kept: CatalogRow;
  seen: CatalogRow;
}

/**
 * One-shot bulk import of the supplier catalog (boss's spreadsheet) into the
 * standalone CatalogMaterial table. Values are imported literally as-is;
 * warehouse Material/Stock rows are never touched.
 *
 * - Row identity is (code, plant). Identical duplicate pairs merge silently;
 *   divergent pairs go to `conflicts` and the first row wins.
 * - Rows without a code are skipped and reported.
 * - Idempotent: re-running over an unchanged file prints created=0,
 *   updated=0 (only `unchanged` grows).
 */
function normalizeCode(value: unknown): string {
  if (typeof value === "number") return String(value);
  const text = String(value ?? "").trim();
  return text.endsWith(".0") ? text.slice(0, -2) : text;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function loadRows(): { rows: CatalogRow[]; skipped: number } {
  if (!existsSync(SOURCE)) {
    throw new Error(
      `Source file not found: ${SOURCE} (local-only copy, never committed — see docs/catalog-import.md)`,
    );
  }
  const workbook = XLSX.readFile(SOURCE);
  const sheet = workbook.Sheets[SHEET];
  if (!sheet) {
    throw new Error(`Sheet "${SHEET}" not found in ${SOURCE}`);
  }
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
  });
  if (grid.length === 0) throw new Error(`Sheet "${SHEET}" is empty`);

  const header = grid[0].map((cell) => text(cell));
  const col = (name: string, fallback: number): number => {
    const index = header.indexOf(name);
    return index === -1 ? fallback : index;
  };
  const iCode = col("Material", 0);
  const iName = col("Texto breve de material", 1);
  const iPlant = col("Centro", 2);
  const iDepot = col("Depósito", 3);
  const iUnit = col("UM básica", 4);

  const rows: CatalogRow[] = [];
  let skipped = 0;
  for (const line of grid.slice(1)) {
    const code = normalizeCode(line[iCode]);
    if (!code) {
      skipped += 1;
      console.log(`SKIP (no code): name="${text(line[iName])}" plant="${text(line[iPlant])}"`);
      continue;
    }
    const unit = text(line[iUnit]);
    rows.push({
      code,
      plant: text(line[iPlant]),
      name: text(line[iName]),
      storageLocation: text(line[iDepot]),
      unit: unit === "" ? "UN" : unit,
    });
  }
  return { rows, skipped };
}

function dedupe(rows: CatalogRow[]): { unique: CatalogRow[]; conflicts: Conflict[]; merged: number } {
  const byKey = new Map<string, CatalogRow>();
  const conflicts: Conflict[] = [];
  let merged = 0;
  for (const row of rows) {
    const key = `${row.code}\u001d${row.plant}`;
    const kept = byKey.get(key);
    if (!kept) {
      byKey.set(key, row);
      continue;
    }
    if (
      kept.name === row.name &&
      kept.storageLocation === row.storageLocation &&
      kept.unit === row.unit
    ) {
      merged += 1;
      continue;
    }
    conflicts.push({ code: row.code, plant: row.plant, kept, seen: row });
  }
  return { unique: [...byKey.values()], conflicts, merged };
}

function differs(a: CatalogRow, b: { name: string; storageLocation: string; unit: string }): boolean {
  return a.name !== b.name || a.storageLocation !== b.storageLocation || a.unit !== b.unit;
}

async function main(): Promise<void> {
  const { rows, skipped } = loadRows();
  const { unique, conflicts, merged } = dedupe(rows);

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (let start = 0; start < unique.length; start += BATCH_SIZE) {
    const batch = unique.slice(start, start + BATCH_SIZE);
    const existing = await prisma.catalogMaterial.findMany({
      where: { OR: batch.map((row) => ({ code: row.code, plant: row.plant })) },
      select: { id: true, code: true, plant: true, name: true, storageLocation: true, unit: true },
    });
    const byKey = new Map(existing.map((row) => [`${row.code}\u001d${row.plant}`, row]));

    const toCreate: CatalogRow[] = [];
    const toUpdate: { id: string; row: CatalogRow }[] = [];
    for (const row of batch) {
      const found = byKey.get(`${row.code}\u001d${row.plant}`);
      if (!found) toCreate.push(row);
      else if (differs(row, found)) toUpdate.push({ id: found.id, row });
      else unchanged += 1;
    }

    if (toCreate.length > 0) {
      const result = await prisma.catalogMaterial.createMany({ data: toCreate, skipDuplicates: true });
      created += result.count;
      unchanged += toCreate.length - result.count;
    }
    for (const { id, row } of toUpdate) {
      await prisma.catalogMaterial.update({
        where: { id },
        data: { name: row.name, storageLocation: row.storageLocation, unit: row.unit },
      });
      updated += 1;
    }
    console.log(
      `batch ${start / BATCH_SIZE + 1}: +${toCreate.length} created, ~${toUpdate.length} updated`,
    );
  }

  console.log(
    `import done: rows=${rows.length} unique=${unique.length} created=${created} ` +
      `updated=${updated} unchanged=${unchanged} merged=${merged} skipped=${skipped} ` +
      `conflicts=${conflicts.length}`,
  );
  for (const conflict of conflicts) {
    console.log(
      `CONFLICT ${conflict.code} [${conflict.plant}]: kept name="${conflict.kept.name}" ` +
        `depot="${conflict.kept.storageLocation}" unit="${conflict.kept.unit}", saw name="${conflict.seen.name}" ` +
        `depot="${conflict.seen.storageLocation}" unit="${conflict.seen.unit}"`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
