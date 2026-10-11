"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiErrorMessage, safeJson } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/forms";
import { Barcode } from "@/components/barcode";
import { toast } from "sonner";

interface CatalogOption {
  id: string;
  code: string;
  plant: string;
  name: string;
  unit: string;
}

/** Labels per A4 sheet on the small batch layout (matches the 4x4 grid). */
const SMALL_PER_PAGE = 16;

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

/** Prefer the BLCT row when a code exists in several plants. */
function preferBlct(options: CatalogOption[], code: string): CatalogOption | null {
  const exact = options.filter((o) => o.code === code);
  if (exact.length === 0) return null;
  return exact.find((o) => o.plant === "BLCT") ?? exact[0];
}

/** Print rules: A4 with fixed millimeter geometry so labels land exactly. */
const PRINT_CSS = `
@page { size: A4 portrait; margin: 7mm; }
.etq-small-sheet { display: grid; grid-template-columns: repeat(4, 1fr); }
.etq-small {
  width: 49mm;
  height: 70.7mm;
  border: 0.4mm solid #000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2mm;
  overflow: hidden;
  gap: 1mm;
  color: #000;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.etq-small .etq-code { font-family: ui-monospace, monospace; font-size: 11pt; font-weight: 700; }
.etq-small .etq-name { font-size: 8pt; line-height: 1.2; }
.etq-small .etq-unit { font-size: 7pt; color: #333; }
.etq-small svg { width: 44mm; height: 11mm; }
.etq-large {
  width: 196mm;
  min-height: 260mm;
  border: 1mm solid #000;
  padding: 8mm;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: #000;
  background: #fff;
  font-size: 13pt;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.etq-large svg { width: 120mm; height: 20mm; }
@media print {
  aside, header { display: none !important; }
  main { padding: 0 !important; margin: 0 !important; background: #fff !important; }
  .md\\:ml-64, .md\\:ml-16 { margin-left: 0 !important; }
  .etq-page { break-after: page; }
  .etq-page:last-child { break-after: auto; }
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

  const { data: options = [] } = useQuery({
    queryKey: ["catalog-options", debounced],
    queryFn: () => searchCatalog(debounced),
    enabled: debounced.length >= 2,
  });

  useEffect(() => {
    if (debounced.length >= 2) {
      const match = preferBlct(options, debounced);
      onChange(debounced, match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, options.length]);

  return (
    <div className="relative">
      <FormInput
        value={code}
        onChange={(e) => {
          onChange(e.target.value, null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        label="Código"
        placeholder="Digite o código…"
        autoComplete="off"
      />
      {open && debounced.length >= 2 && options.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-card shadow-lg">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={() => {
                onChange(o.code, o);
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <span className="font-mono font-semibold text-primary">{o.code}</span>{" "}
              <span className="truncate">{o.name}</span>
              <span className="ml-1 text-xs text-muted-foreground">[{o.plant}]</span>
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

function SmallLabel({ code, item }: { code: string; item: CatalogOption | null }) {
  return (
    <div className="etq-small">
      <span className="etq-code">{code || "—"}</span>
      <span className="etq-name line-clamp-2">{item?.name ?? " "}</span>
      <span className="etq-unit">{item ? `Und.Med: ${item.unit}` : " "}</span>
      <Barcode code={code} height={36} />
    </div>
  );
}

function SmallBatchTab() {
  const [rows, setRows] = useState<SmallRow[]>([{ key: 0, code: "", item: null }]);
  const [nextKey, setNextKey] = useState(1);

  function updateRow(key: number, code: string, item: CatalogOption | null): void {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, code, item } : r)));
  }

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
                  <CodePicker
                    code={row.code}
                    onChange={(code, item) => updateRow(row.key, code, item)}
                  />
                </div>
                {row.item ? (
                  <Badge variant="success" className="mb-2 shrink-0">
                    {row.item.plant}
                  </Badge>
                ) : (
                  row.code.trim() !== "" && (
                    <Badge variant="secondary" className="mb-2 shrink-0">
                      não encontrado
                    </Badge>
                  )
                )}
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
              <Button variant="outline" size="sm" onClick={addRow}>
                Adicionar código
              </Button>
              <Button size="sm" disabled={printable.length === 0} onClick={() => window.print()}>
                Imprimir ({printable.length} {printable.length === 1 ? "etiqueta" : "etiquetas"})
              </Button>
            </div>
          </CardContent>
        </Card>

        {printable.length > 0 && (
          <Card className="mb-4">
            <CardContent className="pt-4">
              <p className="mb-2 text-sm text-muted-foreground">
                Pré-visualização em tamanho real — {SMALL_PER_PAGE} por folha A4
              </p>
              <div className="overflow-x-auto">
                <div className="etq-small-sheet w-fit">
                  {printable.map((row) => (
                    <SmallLabel key={row.key} code={row.code} item={row.item} />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="hidden print:block">
        {pages.map((page, i) => (
          <div key={i} className="etq-page etq-small-sheet">
            {page.map((row) => (
              <SmallLabel key={row.key} code={row.code} item={row.item} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function LargeLabelTab() {
  const [code, setCode] = useState("");
  const [item, setItem] = useState<CatalogOption | null>(null);
  const [pallet, setPallet] = useState(false);
  const [lengths, setLengths] = useState<string[]>([""]);

  const cuts = lengths.map((l) => Number(l)).filter((n) => Number.isFinite(n) && n > 0);
  const total = cuts.reduce((sum, n) => sum + n, 0);

  function showResolveHint(): void {
    if (code.trim() !== "" && !item) toast.error("Código não encontrado no catálogo");
  }

  return (
    <div>
      <div className="print:hidden">
        <Card className="mb-4">
          <CardContent className="space-y-4 pt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <CodePicker
                code={code}
                onChange={(c, found) => {
                  setCode(c);
                  setItem(found);
                }}
              />
              <div className="flex items-end gap-2 pb-1">
                <input
                  id="pallet-toggle"
                  type="checkbox"
                  checked={pallet}
                  onChange={(e) => setPallet(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                <label htmlFor="pallet-toggle" className="text-sm">
                  Palete com vários cabos (lista de cortes)
                </label>
              </div>
            </div>

            {item && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <span className="font-mono font-semibold text-primary">{item.code}</span> · {item.name} ·{" "}
                {item.unit} [{item.plant}]
              </div>
            )}

            {pallet && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Comprimentos (m)</p>
                {lengths.map((len, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <FormInput
                      value={len}
                      onChange={(e) =>
                        setLengths((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                      }
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
                      onClick={() => setLengths((prev) => prev.filter((_, j) => j !== i))}
                      disabled={lengths.length === 1}
                    >
                      Remover
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setLengths((prev) => [...prev, ""])}>
                  Adicionar corte
                </Button>
                <p className="text-sm text-muted-foreground">Total: {total}M</p>
              </div>
            )}

            <Button
              size="sm"
              disabled={code.trim() === ""}
              onClick={() => {
                showResolveHint();
                window.print();
              }}
            >
              Imprimir etiqueta grande
            </Button>
          </CardContent>
        </Card>
      </div>

      {code.trim() !== "" && (
        <div className="hidden print:block">
          <div className="etq-page etq-large">
            <div>
              <p>
                MATERIAL ENEL&nbsp;&nbsp;&nbsp;&nbsp;CÓD:{" "}
                <span className="font-mono font-bold">{code}</span>
              </p>
              <p className="mt-6">DESCRIÇÃO:</p>
              <p className="mt-1 font-semibold" style={{ fontSize: "16pt" }}>
                {item?.name ?? " "}
              </p>
              <p className="mt-6 text-right">UND.MED: {item?.unit ?? ""}</p>
              <div className="mt-6 flex justify-center">
                <Barcode code={code} height={72} />
              </div>
            </div>
            {pallet && cuts.length > 0 && (
              <p className="mt-8">
                ESCOLTAS DE: {cuts.join("; ")} <br />
                <br />
                TOTAL DE: {total}M
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EtiquetasPage() {
  const [tab, setTab] = useState<"pequena" | "grande">("pequena");

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
      </div>

      {tab === "pequena" ? <SmallBatchTab /> : <LargeLabelTab />}
    </div>
  );
}
