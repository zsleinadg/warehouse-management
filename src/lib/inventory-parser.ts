export interface InventoryEntry {
  /** Location path, e.g. ["P1", "Right", "Meio"]. */
  path: string[];
  code: string | null;
  name: string;
  quantity: number;
  needsReview: boolean;
  notes: string | null;
}

const TOP_PATTERN = /^(P\d)(\s+(Left|Right))?$/i;
const CORRIDOR_PATTERN = /^Corredor\s+(.+)$/i;
const CONTINUING_SUFFIX = /\s+Continuando$/i;
const QUANTITY_PATTERN = /\((\d+)x\)\s*$/i;
const NOTE_PATTERN = /_([^_]+)_/;
const CODE_PATTERN = /^(\d+)\s+(.+)$/;

/**
 * Depth rank of a sub-heading. Lower = closer to the root.
 * "Meio" (rank 2) contains "Meio 1" (rank 3) which contains
 * "Meio 1 Parte 2" (rank 4). Unknown headings return -1.
 */
function headingRank(heading: string): number {
  if (/^(Baixo|Meio|Cima)$/i.test(heading)) return 2;
  if (/^Meio\s+\d+/i.test(heading)) return 3;
  if (/Parte\s+\d+/i.test(heading)) return 4;
  return -1;
}

function parseItem(line: string, path: string[]): InventoryEntry {
  let rest = line;
  let needsReview = false;
  let notes: string | null = null;

  const quantityMatch = rest.match(QUANTITY_PATTERN);
  const quantity = quantityMatch ? parseInt(quantityMatch[1], 10) : 1;
  if (quantityMatch) rest = rest.slice(0, quantityMatch.index).trim();

  if (rest.includes("*")) {
    needsReview = true;
    rest = rest.replaceAll("*", "").trim();
  }

  const noteMatch = rest.match(NOTE_PATTERN);
  if (noteMatch) {
    needsReview = true;
    notes = noteMatch[1].trim();
    rest = rest.replace(NOTE_PATTERN, "").replace(/\s+/g, " ").trim();
  }

  const codeMatch = rest.match(CODE_PATTERN);
  return {
    path: [...path],
    code: codeMatch ? codeMatch[1] : null,
    name: codeMatch ? codeMatch[2].trim() : rest,
    quantity,
    needsReview,
    notes,
  };
}

/**
 * Parse the manual stock-taking text (WhatsApp format) into entries.
 *
 * Heading rules:
 * - "P1 Left" resets the path to ["P1", "Left"]; "Corredor P3-P4" to itself
 * - Ranked sub-headings ("Baixo" < "Meio 1" < "Parte 2") truncate the
 *   stack to their rank, so levels never need explicit nesting
 * - "Meio 1 Continuando" jumps back to the "Meio 1" section
 */
export function parseInventory(text: string): InventoryEntry[] {
  const entries: InventoryEntry[] = [];
  let stack: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const topMatch = line.match(TOP_PATTERN);
    if (topMatch) {
      stack = topMatch[2] ? [topMatch[1].toUpperCase(), topMatch[3]] : [topMatch[1].toUpperCase()];
      continue;
    }

    const corridorMatch = line.match(CORRIDOR_PATTERN);
    if (corridorMatch) {
      stack = [line];
      continue;
    }

    let heading = line;
    if (CONTINUING_SUFFIX.test(heading)) {
      heading = heading.replace(CONTINUING_SUFFIX, "").trim();
    }

    const rank = headingRank(heading);
    if (rank > 0) {
      stack = [...stack.slice(0, rank), heading];
      continue;
    }

    entries.push(parseItem(line, stack));
  }

  return entries;
}
