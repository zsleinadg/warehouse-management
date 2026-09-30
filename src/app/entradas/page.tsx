"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCanEdit } from "@/hooks/use-me";
import { apiErrorMessage, formatCents } from "@/lib/api-client";

interface CatalogMaterial {
  id: string;
  code: string;
  name: string;
  unit: string;
  disabled: boolean;
}

interface LocationOption {
  id: string;
  name: string;
  parentId: string | null;
  disabled: boolean;
}

interface InvoiceSummary {
  id: string;
  number: string;
  supplier: string;
  issuedAt: string;
  linesCount: number;
  totalQuantity: number;
  totalCostCents: number;
}

interface InvoiceDetail {
  id: string;
  number: string;
  supplier: string;
  issuedAt: string;
  totalCostCents: number;
  lines: {
    id: string;
    quantity: number;
    unitCostCents: number;
    material: { id: string; code: string; name: string; unit: string };
  }[];
}

async function fetchInvoices(): Promise<InvoiceSummary[]> {
  const response = await fetch("/api/purchase-invoices");
  if (!response.ok) throw new Error("Failed to load invoices");
  const body = await response.json();
  return body.data ?? [];
}

async function fetchCatalog(): Promise<CatalogMaterial[]> {
  const response = await fetch("/api/materials");
  if (!response.ok) throw new Error("Failed to load catalog");
  const body = await response.json();
  return (body.data ?? []).filter((m: CatalogMaterial) => !m.disabled);
}

async function fetchLocationOptions(): Promise<LocationOption[]> {
  const response = await fetch("/api/locations");
  if (!response.ok) throw new Error("Failed to load locations");
  const body = await response.json();
  return (body.data ?? []).filter((l: LocationOption) => !l.disabled);
}

interface DraftLine {
  materialId: string;
  locationId: string;
  quantity: number;
  unitCostCents: number;
}

const EMPTY_LINE: DraftLine = { materialId: "", locationId: "", quantity: 1, unitCostCents: 0 };

export default function EntradasPage() {
  const queryClient = useQueryClient();
  const canEdit = useCanEdit();
  const [number, setNumber] = useState("");
  const [supplier, setSupplier] = useState("");
  const [issuedAt, setIssuedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<DraftLine[]>([{ ...EMPTY_LINE }]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: fetchInvoices });
  const { data: catalog = [] } = useQuery({ queryKey: ["materials"], queryFn: fetchCatalog });
  const { data: locations = [] } = useQuery({
    queryKey: ["locations"],
    queryFn: fetchLocationOptions,
  });
  const { data: detail } = useQuery({
    queryKey: ["invoice", selectedId],
    queryFn: async (): Promise<InvoiceDetail | null> => {
      if (!selectedId) return null;
      const response = await fetch(`/api/purchase-invoices/${selectedId}`);
      if (!response.ok) throw new Error("Failed to load invoice");
      const body = await response.json();
      return body.data;
    },
    enabled: selectedId !== null,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      const response = await fetch("/api/purchase-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number, supplier, issuedAt, lines }),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await response.json(), "Create failed"));
      return response.json();
    },
    onSuccess: (body) => {
      setNumber("");
      setSupplier("");
      setLines([{ ...EMPTY_LINE }]);
      setSelectedId(body.data.id);
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["tree"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  function setLine(index: number, patch: Partial<DraftLine>): void {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Entradas · Notas Fiscais</h2>

      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="mb-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-2.5 dark:border-zinc-700 dark:bg-black"
        >
          <div className="mb-2 flex flex-wrap gap-2">
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="Número da NF"
              className="min-w-30 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
            />
            <input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="Fornecedor"
              className="min-w-40 flex-[2] rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
            />
            <input
              type="date"
              value={issuedAt}
              onChange={(e) => setIssuedAt(e.target.value)}
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>
          {lines.map((line, i) => (
            <div key={i} className="mb-2 flex flex-wrap gap-2">
              <select
                value={line.materialId}
                onChange={(e) => setLine(i, { materialId: e.target.value })}
                className="min-w-40 flex-[2] rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="">Material…</option>
                {catalog.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </select>
              <select
                value={line.locationId}
                onChange={(e) => setLine(i, { locationId: e.target.value })}
                className="min-w-40 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="">Local…</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={line.quantity}
                onChange={(e) => setLine(i, { quantity: Number(e.target.value) })}
                title="Quantidade"
                className="w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
              />
              <input
                type="number"
                min={0}
                value={line.unitCostCents}
                onChange={(e) => setLine(i, { unitCostCents: Number(e.target.value) })}
                title="Custo unitário (centavos)"
                className="w-32 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
              />
              {lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-[13px] dark:border-zinc-700"
            >
              + Item
            </button>
            <button
              type="submit"
              className="rounded-lg border border-sky-400 bg-sky-100 px-3 py-1.5 text-[13px] font-semibold text-sky-800 hover:brightness-105 dark:bg-sky-950 dark:text-sky-300"
            >
              Registrar NF
            </button>
          </div>
          {error && <p className="mt-2 w-full text-xs text-red-600">{error}</p>}
          <p className="mt-1.5 text-[11px] text-zinc-500">
            A NF soma o estoque, gera INBOUND por item e atualiza o custo médio. NFs são imutáveis.
          </p>
        </form>
      )}

      <div className="flex gap-3">
        <div className="w-72 flex-shrink-0">
          <h3 className="mb-2 text-sm font-semibold">Notas registradas</h3>
          {invoices.map((inv) => (
            <button
              key={inv.id}
              onClick={() => setSelectedId(inv.id)}
              className={`mb-1.5 block w-full rounded-lg border px-2.5 py-2 text-left text-[13px] ${
                selectedId === inv.id
                  ? "border-sky-400 bg-sky-100 dark:bg-sky-950"
                  : "border-zinc-200 dark:border-zinc-700"
              }`}
            >
              <span className="font-mono font-semibold">NF {inv.number}</span>
              <span className="block text-xs text-zinc-500">
                {inv.supplier} · {inv.linesCount} itens · ×{inv.totalQuantity} ·{" "}
                {formatCents(inv.totalCostCents)}
              </span>
            </button>
          ))}
          {invoices.length === 0 && (
            <p className="text-[13px] text-zinc-500">Nenhuma NF registrada.</p>
          )}
        </div>
        <div className="flex-1">
          {!detail ? (
            <p className="text-[13px] text-zinc-500">Selecione uma NF para ver os itens.</p>
          ) : (
            <div>
              <h3 className="mb-1 text-sm font-semibold">
                NF {detail.number} — {detail.supplier}
              </h3>
              <p className="mb-2 text-xs text-zinc-500">
                Emitida em {new Date(detail.issuedAt).toLocaleDateString("pt-BR")} · Total{" "}
                {formatCents(detail.totalCostCents)}
              </p>
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-zinc-50 text-left dark:bg-black">
                      <th className="px-2.5 py-1.5 font-medium">Material</th>
                      <th className="px-2.5 py-1.5 font-medium">Qtd</th>
                      <th className="px-2.5 py-1.5 font-medium">Custo un.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((line) => (
                      <tr key={line.id} className="border-t border-zinc-200 dark:border-zinc-700">
                        <td className="px-2.5 py-1.5">
                          <span className="mr-1.5 font-mono font-semibold text-sky-800 dark:text-sky-300">
                            {line.material.code}
                          </span>
                          {line.material.name}
                        </td>
                        <td className="px-2.5 py-1.5">
                          ×{line.quantity} {line.material.unit}
                        </td>
                        <td className="px-2.5 py-1.5">{formatCents(line.unitCostCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
