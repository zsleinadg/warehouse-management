"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCents } from "@/lib/api-client";

interface ReportRow {
  materialCode: string;
  materialName: string;
  unit: string;
  totalQuantity: number;
  totalCostCents: number;
  avgCostCents: number;
  movements: { type: string; quantity: number; destination: string | null; createdAt: string }[];
}

async function fetchReport(params: URLSearchParams): Promise<ReportRow[]> {
  const response = await fetch(`/api/reports?${params.toString()}`);
  if (!response.ok) throw new Error("Failed to load report");
  const body = await response.json();
  return body.data ?? [];
}

async function fetchMaterials(): Promise<{ id: string; code: string; name: string; unit: string; disabled: boolean }[]> {
  const response = await fetch("/api/materials");
  if (!response.ok) throw new Error("Failed to load materials");
  const body = await response.json();
  return (body.data ?? []).filter((m: { disabled: boolean }) => !m.disabled);
}

async function fetchIssues(): Promise<{ id: string; number: number; ot: string | null; destination: string }[]> {
  const response = await fetch("/api/issues?status=CLOSED");
  if (!response.ok) throw new Error("Failed to load issues");
  const body = await response.json();
  return body.data ?? [];
}

function downloadCSV(rows: ReportRow[], filename: string): void {
  const headers = ["Código", "Material", "Un", "Qtd Total", "Custo Total", "Custo Médio", "Detalhes"];
  const lines = [
    headers.join(","),
    ...rows.map((r) => [
      r.materialCode,
      `"${r.materialName}"`,
      r.unit,
      r.totalQuantity,
      formatCents(r.totalCostCents).replace("R$", "").replace(/\./g, "").replace(",", "."),
      formatCents(r.avgCostCents).replace("R$", "").replace(/\./g, "").replace(",", "."),
      `"${r.movements.map((m) => `${m.type} ×${m.quantity} → ${m.destination ?? "—"}`).join("; ")}"`,
    ].join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RelatoriosPage() {
  const [ot, setOt] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: materials = [] } = useQuery({ queryKey: ["materials"], queryFn: fetchMaterials });
  const { data: issues = [] } = useQuery({ queryKey: ["issues", "CLOSED"], queryFn: fetchIssues });

  const params = new URLSearchParams();
  if (ot) params.set("ot", ot);
  if (materialId) params.set("materialId", materialId);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  const { data: report = [], isLoading, refetch } = useQuery({
    queryKey: ["report", params.toString()],
    queryFn: () => fetchReport(params),
    enabled: Boolean(ot || materialId || dateFrom || dateTo),
  });

  function handleExport(): void {
    if (report.length === 0) {
      setError("Nenhum dado para exportar");
      return;
    }
    setError(null);
    const filename = `consumo-${ot || "todos"}-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCSV(report, filename);
  }

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Relatórios de Consumo</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          refetch();
        }}
        className="mb-3 flex flex-wrap gap-2 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-2.5 dark:border-zinc-700 dark:bg-black"
      >
        <select
          value={ot}
          onChange={(e) => setOt(e.target.value)}
          className="min-w-32 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
        >
          <option value="">Todas as OT/obras</option>
          {issues.map((i) => (
            <option key={i.id} value={i.id}>
              #{i.number}{i.ot ? ` · ${i.ot}` : ""} — {i.destination}
            </option>
          ))}
        </select>
        <select
          value={materialId}
          onChange={(e) => setMaterialId(e.target.value)}
          className="min-w-32 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
        >
          <option value="">Todos os materiais</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code} — {m.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
        />
        <button
          type="submit"
          className="rounded-lg border border-sky-400 bg-sky-100 px-3 py-1.5 text-[13px] font-semibold text-sky-800 hover:brightness-105 dark:bg-sky-950 dark:text-sky-300"
        >
          Gerar
        </button>
        <button
          type="button"
          onClick={handleExport}
          className="rounded-lg border border-emerald-400 bg-emerald-100 px-3 py-1.5 text-[13px] font-semibold text-emerald-800 hover:brightness-105 dark:bg-emerald-950 dark:text-emerald-300"
        >
          Exportar CSV
        </button>
        {error && <p className="w-full text-xs text-red-600">{error}</p>}
      </form>

      {isLoading ? (
        <p className="text-[13px] text-zinc-500">Carregando…</p>
      ) : report.length === 0 ? (
        <p className="text-[13px] text-zinc-500">Nenhum dado encontrado. Aplique filtros e clique em Gerar.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-zinc-50 text-left dark:bg-black">
                <th className="px-2.5 py-1.5 font-medium">Código</th>
                <th className="px-2.5 py-1.5 font-medium">Material</th>
                <th className="px-2.5 py-1.5 font-medium">Un</th>
                <th className="px-2.5 py-1.5 font-medium">Qtd Total</th>
                <th className="px-2.5 py-1.5 font-medium">Custo Total</th>
                <th className="px-2.5 py-1.5 font-medium">Custo Médio</th>
                <th className="px-2.5 py-1.5 font-medium">Movimentações</th>
              </tr>
            </thead>
            <tbody>
              {report.map((r, i) => (
                <tr key={i} className="border-t border-zinc-200 dark:border-zinc-700">
                  <td className="px-2.5 py-1.5 font-mono font-semibold text-sky-800 dark:text-sky-300">
                    {r.materialCode}
                  </td>
                  <td className="px-2.5 py-1.5">{r.materialName}</td>
                  <td className="px-2.5 py-1.5">{r.unit}</td>
                  <td className="px-2.5 py-1.5">×{r.totalQuantity}</td>
                  <td className="px-2.5 py-1.5">{formatCents(r.totalCostCents)}</td>
                  <td className="px-2.5 py-1.5">{formatCents(r.avgCostCents)}</td>
                  <td className="px-2.5 py-1.5 text-zinc-500 text-[11px] max-w-xs truncate">
                    {r.movements.map((m) => `${m.type} ×${m.quantity} → ${m.destination ?? "—"}`).join("; ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}