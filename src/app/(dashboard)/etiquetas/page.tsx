"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiErrorMessage, safeJson } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/forms";
import { toast } from "sonner";
import {
  BARCODE_FONT,
  LABEL_PRINT,
  LargeLabel,
  SMALL_PER_PAGE,
  SmallSheet,
  type LabelItem,
} from "@/components/excel-labels";
import { WordLabelsTab } from "@/components/labels/WordLabelsTab";

interface CatalogOption extends LabelItem {
  id: string;
  code: string;
  plant: string;
}

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

async function searchCatalog(q: string): Promise<CatalogOption[]> {
  const params = new URLSearchParams({ q, take: "8" });
  const response = await fetch(`/api/catalog?${params.toString()}`);
  if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), "Failed to search catalog"));
  const body = (await safeJson(response)) as { data?: CatalogOption[] };
  return body.data ?? [];
}

function preferBlct(options: CatalogOption[], code: string): CatalogOption | null {
  const exact = options.filter((o) => o.code === code);
  if (exact.length === 0) return null;
  return exact.find((o) => o.plant === "BLCT") ?? exact[0];
}

/** Garante que a fonte do código de barras carregou ANTES de abrir o diálogo de impressão. */
async function printLabels(): Promise<void> {
  try {
    await document.fonts.load(`36pt ${BARCODE_FONT}`, "*0123456789ABC*");
    await document.fonts.ready;
  } catch {
    // segue para imprimir mesmo assim
  }
  window.print();
}

const PRINT_CSS = `
/* Ambas as abas do Excel são A4 paisagem com margem 0 — configure "Margens: Nenhuma" e "Escala: 100%" no diálogo */
@page { size: A4 landscape; margin: 0; }
@media print {
  aside, header { display: none !important; }
  main { padding: 0 !important; margin: 0 !important; background: #fff !important; }
  .md\\:ml-64, .md\\:ml-16 { margin-left: 0 !important; }
  .etq-page {
    width: 297mm;
    height: 209mm;
    box-sizing: border-box;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: ${LABEL_PRINT.smallTopOffsetMm}mm;
    overflow: hidden;
    break-after: page;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .etq-page--center { align-items: center; padding-top: 0; }
  .etq-page:last-child { break-after: auto; }
  
  /* Ensure logo stays behind grid content in print */
  .etq-page [style*="zIndex"] { z-index: 0 !important; }
  .etq-page [style*="gridTemplateColumns"] > div { position: relative; z-index: 1; }
}
`;

function CodePicker({
  code,
  onChange,
}: {
  code: string;
  onChange: (code: string, item: CatalogOption | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(code.trim(), 300);
  const lastMatchedRef = useRef<string>("");
  const lockedRef = useRef<string>("");
  // Stable callback ref: the resolve effect must not re-fire just because
  // the parent re-rendered (inline onChange identity). Otherwise a click
  // gets clobbered by a run with the stale partial text.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const { data: options = [], isFetching } = useQuery({
    queryKey: ["catalog-options", debounced],
    queryFn: () => searchCatalog(debounced),
    enabled: debounced.length >= 2,
  });

  // One row per code: same material exists in several plants, the label
  // only needs code + name (BLCT preferred silently when names differ).
  const deduped = useMemo(() => {
    const seen = new Set<string>();
    const rows: CatalogOption[] = [];
    for (const o of options) {
      if (seen.has(o.code)) continue;
      seen.add(o.code);
      rows.push(preferBlct(options, o.code) ?? o);
    }
    return rows;
  }, [options]);

  useEffect(() => {
    // An explicit click wins: while the text still matches the picked code,
    // never let a refetch overwrite (or clear) the user's choice.
    if (lockedRef.current !== "" && debounced === lockedRef.current) return;
    // While a new search is in flight, options are stale/empty — resolving
    // now would wipe a just-picked item with null.
    if (isFetching) return;
    if (debounced.length >= 2) {
      const match = preferBlct(options, debounced);
      const matchKey = `${debounced}-${match?.id ?? "none"}`;
      if (lastMatchedRef.current !== matchKey) {
        lastMatchedRef.current = matchKey;
        onChangeRef.current(debounced, match);
      }
    } else {
      lastMatchedRef.current = "";
    }
  }, [debounced, options, isFetching]);

  return (
    <div className="relative">
      <FormInput
        value={code}
        onChange={(e) => {
          lockedRef.current = "";
          onChange(e.target.value, null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        label="Código"
        placeholder="Digite o código…"
        autoComplete="off"
      />
      {open && debounced.length >= 2 && deduped.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-card shadow-lg">
          {deduped.map((o) => (
            <button
              key={o.code}
              type="button"
              onMouseDown={() => {
                lastMatchedRef.current = `${o.code}-${o.id}`;
                lockedRef.current = o.code;
                onChangeRef.current(o.code, o);
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <span className="font-mono font-semibold text-primary">{o.code}</span>{" "}
              <span className="truncate">{o.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface SmallRow {
  key: number;
  code: string;
  item: CatalogOption | null;
}

function SmallBatchTab() {
  const [rows, setRows] = useState<SmallRow[]>([{ key: 0, code: "", item: null }]);
  const [nextKey, setNextKey] = useState(1);

  const updateRow = useCallback((key: number, code: string, item: CatalogOption | null): void => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, code, item } : r)));
  }, []);

  function addRow(): void {
    setRows((prev) => [...prev, { key: nextKey, code: "", item: null }]);
    setNextKey((k) => k + 1);
  }

  const printable = rows.filter((r) => r.code.trim() !== "");
  const pages: SmallRow[][] = [];
  for (let i = 0; i < printable.length; i += SMALL_PER_PAGE) {
    pages.push(printable.slice(i, i + SMALL_PER_PAGE));
  }

  return (
    <div>
      <div className="print:hidden">
        <Card className="mb-4">
          <CardContent className="space-y-3 pt-4">
            {rows.map((row) => (
              <div key={row.key} className="flex items-end gap-2">
                <div className="flex-1">
                  <CodePicker code={row.code} onChange={(code, item) => updateRow(row.key, code, item)} />
                </div>
                {row.item == null &&
                  row.code.trim() !== "" && <Badge variant="secondary" className="mb-2 shrink-0">não encontrado</Badge>}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-1 shrink-0 text-destructive hover:text-destructive"
                  onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                  disabled={rows.length === 1}
                >
                  Remover
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={addRow}>Adicionar código</Button>
              <Button size="sm" disabled={printable.length === 0} onClick={() => void printLabels()}>
                Imprimir ({printable.length} {printable.length === 1 ? "etiqueta" : "etiquetas"})
              </Button>
            </div>
          </CardContent>
        </Card>

        {pages.map((page, i) => (
          <Card key={i} className="mb-4">
            <CardContent className="pt-4">
              <p className="mb-2 text-sm text-muted-foreground">
                Pré-visualização em tamanho real — folha {i + 1} de {pages.length} (A4 paisagem, {SMALL_PER_PAGE} por folha)
              </p>
              <div className="overflow-x-auto bg-muted/20 p-2">
                <div className="w-fit bg-white p-2">
                  <SmallSheet labels={page} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="hidden print:block">
        {pages.map((page, i) => (
          <div key={i} className="etq-page">
            <SmallSheet labels={page} />
          </div>
        ))}
      </div>
    </div>
  );
}

function parseMeters(raw: string): number {
  return Number(raw.trim().replace(",", "."));
}

interface LargeItemRow {
  key: number;
  code: string;
  item: CatalogOption | null;
  pallet: boolean;
  lengths: string[];
}

function LargeLabelTab() {
  const [items, setItems] = useState<LargeItemRow[]>([{ key: 0, code: "", item: null, pallet: false, lengths: [""] }]);
  const [nextKey, setNextKey] = useState(1);

  const addRow = useCallback(() => {
    setItems((prev) => [...prev, { key: nextKey, code: "", item: null, pallet: false, lengths: [""] }]);
    setNextKey((k) => k + 1);
  }, [nextKey]);

  const removeRow = useCallback((key: number) => {
    setItems((prev) => prev.filter((r) => r.key !== key));
  }, []);

  const updateRow = useCallback((key: number, patch: Partial<LargeItemRow>) => {
    setItems((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }, []);

  const printableItems = items.filter((r) => r.code.trim() !== "");

  function showResolveHint(): void {
    const unresolved = printableItems.filter((r) => r.item === null);
    if (unresolved.length > 0) toast.error(`${unresolved.length} código(s) não encontrado(s) no catálogo`);
  }

  return (
    <div>
      <div className="print:hidden">
        <Card className="mb-4">
          <CardContent className="space-y-4 pt-4">
            {items.map((row) => (
              <div key={row.key} className="space-y-3 p-3 border rounded-lg bg-muted/30">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <CodePicker
                      code={row.code}
                      onChange={(c, found) => updateRow(row.key, { code: c, item: found })}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mb-1 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => removeRow(row.key)}
                    disabled={items.length === 1}
                  >
                    Remover
                  </Button>
                </div>

                {row.item && (
                  <div className="rounded-lg bg-muted/50 p-3 text-sm">
                    <span className="font-mono font-semibold text-primary">{row.item.code}</span> · {row.item.name} · {row.item.unit}
                  </div>
                )}

                <div className="flex items-end gap-2 pb-1">
                  <input
                    id={`pallet-toggle-${row.key}`}
                    type="checkbox"
                    checked={row.pallet}
                    onChange={(e) => updateRow(row.key, { pallet: e.target.checked })}
                    className="h-4 w-4 accent-primary"
                  />
                  <label htmlFor={`pallet-toggle-${row.key}`} className="text-sm font-medium">
                    Palete com vários cabos (lista de cortes)
                  </label>
                </div>

                {row.pallet && (
                  <div className="space-y-2 pl-6">
                    <p className="text-sm font-medium">Comprimentos (m)</p>
                    {row.lengths.map((len, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <FormInput
                          value={len}
                          onChange={(e) => updateRow(row.key, { lengths: row.lengths.map((v, j) => (j === i ? e.target.value : v)) })}
                          label={`Corte ${i + 1}`}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="0"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-5 shrink-0 text-destructive hover:text-destructive"
                          onClick={() => updateRow(row.key, { lengths: row.lengths.filter((_, j) => j !== i) })}
                          disabled={row.lengths.length === 1}
                        >
                          Remover
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => updateRow(row.key, { lengths: [...row.lengths, ""] })}>
                      Adicionar corte
                    </Button>
                    <p className="text-sm text-muted-foreground">
                      Total: {String(Number(row.lengths.map(parseMeters).filter((n) => Number.isFinite(n) && n > 0).reduce((sum, n) => sum + n, 0).toFixed(2))).replace(".", ",")}M
                    </p>
                  </div>
                )}
              </div>
            ))}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={addRow}>
                Adicionar etiqueta
              </Button>
              <Button
                size="sm"
                disabled={printableItems.length === 0}
                onClick={() => {
                  showResolveHint();
                  void printLabels();
                }}
              >
                Imprimir ({printableItems.length} {printableItems.length === 1 ? "etiqueta" : "etiquetas"})
              </Button>
            </div>
          </CardContent>
        </Card>

        {printableItems.length > 0 && (
          <div className="space-y-4">
            {printableItems.map((row, idx) => {
              const cuts = row.lengths.map(parseMeters).filter((n) => Number.isFinite(n) && n > 0);
              const total = cuts.reduce((sum, n) => sum + n, 0);
              return (
                <Card key={row.key} className="mb-4">
                  <CardContent className="pt-4">
                    <p className="mb-2 text-sm text-muted-foreground">
                      Pré-visualização — Item {idx + 1} de {printableItems.length} (A4 paisagem, escala {Math.round(LABEL_PRINT.largeScale * 100)}%)
                    </p>
                    <div className="overflow-x-auto bg-muted/20 p-2">
                      <div className="w-fit bg-white">
                        <LargeLabel code={row.code} item={row.item} pallet={row.pallet} cuts={cuts} total={total} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

      </div>

      <div className="hidden print:block">
        {printableItems.map((row) => {
          const cuts = row.lengths.map(parseMeters).filter((n) => Number.isFinite(n) && n > 0);
          const total = cuts.reduce((sum, n) => sum + n, 0);
          return (
            <div key={row.key} className="etq-page etq-page--center">
              <LargeLabel code={row.code} item={row.item} pallet={row.pallet} cuts={cuts} total={total} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function EtiquetasPage() {
  const [tab, setTab] = useState<"pequena" | "grande" | "word">("pequena");

  return (
    <div>
      <style>{PRINT_CSS}</style>
      <h2 className="mb-3 text-lg font-semibold print:hidden">Etiquetas</h2>

      <div className="mb-4 flex gap-2 print:hidden">
        <Button variant={tab === "pequena" ? "default" : "outline"} size="sm" onClick={() => setTab("pequena")}>
          Etiqueta pequena
        </Button>
        <Button variant={tab === "grande" ? "default" : "outline"} size="sm" onClick={() => setTab("grande")}>
          Etiqueta grande
        </Button>
        <Button variant={tab === "word" ? "default" : "outline"} size="sm" onClick={() => setTab("word")}>
          Do Word
        </Button>
      </div>

      {tab === "pequena" ? <SmallBatchTab /> : tab === "grande" ? <LargeLabelTab /> : <WordLabelsTab />}
    </div>
  );
}