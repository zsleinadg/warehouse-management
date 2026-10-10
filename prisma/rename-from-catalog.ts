import prisma from "../src/lib/prisma";

const APPLY = process.argv.includes("--apply");

interface Decision {
  id: string;
  code: string;
  current: string;
  suggested: string | null;
  origin: string;
  status: "rename" | "unchanged" | "ambiguous" | "missing";
}

/**
 * Rename warehouse materials from the supplier catalog (dry-run by default).
 *
 * Name selection per code: the BLCT row wins; otherwise the name shared by
 * every plant; otherwise the row is flagged ambiguous for manual rename.
 * Only `name` changes — code, unit, costs and balances are untouched.
 *
 * Usage:
 *   npx tsx --env-file=.env.local prisma/rename-from-catalog.ts
 *   npx tsx --env-file=.env.local prisma/rename-from-catalog.ts --apply
 */
function pickName(rows: { plant: string; name: string }[]): { name: string; origin: string } | null {
  const blct = rows.find((row) => row.plant === "BLCT");
  if (blct) return { name: blct.name, origin: "BLCT" };
  const names = [...new Set(rows.map((row) => row.name))];
  if (names.length === 1) {
    const plants = [...new Set(rows.map((row) => row.plant))].sort().join(",");
    return { name: names[0], origin: plants };
  }
  return null;
}

async function main(): Promise<void> {
  const materials = await prisma.material.findMany({
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
  const catalog = await prisma.catalogMaterial.findMany({
    where: { code: { in: materials.map((m) => m.code) } },
    select: { code: true, plant: true, name: true },
  });
  const byCode = new Map<string, { plant: string; name: string }[]>();
  for (const row of catalog) {
    const list = byCode.get(row.code) ?? [];
    list.push({ plant: row.plant, name: row.name });
    byCode.set(row.code, list);
  }

  const decisions: Decision[] = materials.map((material) => {
    const rows = byCode.get(material.code) ?? [];
    if (rows.length === 0) {
      return { id: material.id, code: material.code, current: material.name, suggested: null, origin: "-", status: "missing" };
    }
    const picked = pickName(rows);
    if (!picked) {
      const detail = rows.map((r) => `[${r.plant}] ${r.name}`).join(" | ");
      return { id: material.id, code: material.code, current: material.name, suggested: null, origin: detail, status: "ambiguous" };
    }
    if (material.name === picked.name) {
      return { id: material.id, code: material.code, current: material.name, suggested: picked.name, origin: picked.origin, status: "unchanged" };
    }
    return { id: material.id, code: material.code, current: material.name, suggested: picked.name, origin: picked.origin, status: "rename" };
  });

  for (const d of decisions) {
    if (d.status === "rename") {
      console.log(`RENAME ${d.code}: "${d.current}" -> "${d.suggested}" (from ${d.origin})`);
    } else if (d.status !== "unchanged") {
      console.log(`${d.status.toUpperCase()} ${d.code}: "${d.current}" (${d.origin})`);
    }
  }

  const count = (s: Decision["status"]): number => decisions.filter((d) => d.status === s).length;
  console.log(
    `rename report: materials=${materials.length} rename=${count("rename")} ` +
      `unchanged=${count("unchanged")} ambiguous=${count("ambiguous")} missing=${count("missing")}` +
      (APPLY ? " [APPLIED]" : " [DRY-RUN]"),
  );

  if (APPLY) {
    for (const d of decisions) {
      if (d.status !== "rename" || !d.suggested) continue;
      await prisma.material.update({ where: { id: d.id }, data: { name: d.suggested } });
    }
    console.log(`applied ${count("rename")} renames`);
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
