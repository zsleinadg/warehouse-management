/**
 * Money helpers (no external deps).
 * Storage/API convention: integer cents. UI convention: pt-BR string.
 * Mirrors the reference pattern: format to display, parse on the edge.
 */

/** 130050 -> "R$ 1.300,50" */
export function formatCentsBRL(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

/** "1.300,50" (or "R$ 1.300,50") -> 130050. NaN-safe: returns 0. */
export function parseBRLToCents(input: string): number {
  const normalized = input
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const value = parseFloat(normalized);
  if (Number.isNaN(value)) return 0;
  return Math.round(value * 100);
}

/** 130050 -> "1.300,50" (editable text, no symbol). */
export function formatCentsInput(cents: number): string {
  const fixed = (Math.round(cents) / 100).toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${grouped},${decPart}`;
}

/** Raw digits "130050" -> "1.300,50" (live mask while typing). */
export function maskDigitsToBRL(digits: string): string {
  const clean = digits.replace(/\D/g, "");
  if (!clean) return "";
  return formatCentsInput(parseInt(clean, 10));
}
