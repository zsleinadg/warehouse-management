"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatCents, safeJson } from "@/lib/api-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormInput, FormSelect, type FormSelectOption } from "@/components/ui/forms";
import { toast } from "sonner";
import { Download } from "lucide-react";

interface ReportRow {
  materialCode: string;
  materialName: string;
  unit: string;
  totalQuantity: number;
  totalCostCents: number;
  avgCostCents: number;
  movements: { type: string; quantity: number; destination: string | null; nfNumber: string | null; location: string | null; createdAt: string }[];
}

async function fetchReport(params: URLSearchParams): Promise<ReportRow[]> {
  const response = await fetch(`/api/reports?${params.toString()}`);
  if (!response.ok) throw new Error("Failed to load report");
  const body = await safeJson(response);
  return (body as { data?: ReportRow[] })?.data ?? [];
}

async function fetchMaterials(): Promise<{ id: string; code: string; name: string; unit: string; disabled: boolean }[]> {
  const response = await fetch("/api/materials");
  if (!response.ok) throw new Error("Failed to load materials");
  const body = await safeJson(response);
  return ((body as { data?: { id: string; code: string; name: string; unit: string; disabled: boolean }[] })?.data ?? []).filter((m) => !m.disabled);
}

async function fetchIssues(): Promise<{ id: string; number: number; ot: string | null; destination: string }[]> {
  const response = await fetch("/api/issues?status=CLOSED");
  if (!response.ok) throw new Error("Failed to load issues");
  const body = await safeJson(response);
  return (body as { data?: { id: string; number: number; ot: string | null; destination: string }[] })?.data ?? [];
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
      `"${r.movements.map((m) => `${m.type} ×${m.quantity} → ${m.destination ?? "—"}${m.location ? ` @ ${m.location}` : ""}${m.nfNumber ? ` (NF ${m.nfNumber})` : ""}`).join("; ")}"`,
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
  const [kind, setKind] = useState("");
  const [nfNumber, setNfNumber] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: materials = [] } = useQuery({ queryKey: ["materials"], queryFn: fetchMaterials });
  const { data: issues = [] } = useQuery({ queryKey: ["issues", "CLOSED"], queryFn: fetchIssues });

  const params = new URLSearchParams();
  if (ot) params.set("ot", ot);
  if (kind) params.set("kind", kind);
  if (nfNumber.trim()) params.set("nfNumber", nfNumber.trim());
  if (materialId) params.set("materialId", materialId);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  const { data: report = [], isLoading, refetch } = useQuery({
    queryKey: ["report", params.toString()],
    queryFn: () => fetchReport(params),
    enabled: Boolean(ot || kind || nfNumber.trim() || materialId || dateFrom || dateTo),
  });

  function handleExport(): void {
    if (report.length === 0) {
      toast.error("Nenhum dado para exportar");
      return;
    }
    const filename = `consumo-${ot || "todos"}-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCSV(report, filename);
    toast.success("CSV exportado com sucesso");
  }

  const otOptions: FormSelectOption[] = [
    { value: "", label: "Todas as OT/obras" },
    ...issues.map((i) => ({
      value: i.id,
      label: `#${i.number}${i.ot ? ` · ${i.ot}` : ""} — ${i.destination}`,
    })),
  ];

  const materialOptions: FormSelectOption[] = [
    { value: "", label: "Todos os materiais" },
    ...materials.map((m) => ({
      value: m.id,
      label: `${m.code} — ${m.name}`,
    })),
  ];

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Relatórios</h2>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              refetch();
            }}
            className="flex flex-wrap gap-2"
          >
            <FormSelect
              value={ot}
              onValueChange={setOt}
              label="OT / Obra"
              options={otOptions}
              className="min-w-40 flex-1"
            />
            <FormSelect
              value={materialId}
              onValueChange={setMaterialId}
              label="Material"
              options={materialOptions}
              className="min-w-40 flex-1"
            />
            <FormSelect
              value={kind}
              onValueChange={setKind}
              label="Tipo de OT"
              options={[
                { value: "", label: "Obra + Emergencial" },
                { value: "OBRA", label: "Obra" },
                { value: "EMERGENCIAL", label: "Emergencial" },
              ]}
              className="min-w-40 flex-1"
            />
            <FormInput
              value={nfNumber}
              onChange={(e) => setNfNumber(e.target.value)}
              label="NF"
              placeholder="Número da NF"
              className="min-w-40 flex-1"
            />
            <FormInput
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              label="Data inicial"
              type="date"
              className="w-40"
            />
            <FormInput
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              label="Data final"
              type="date"
              className="w-40"
            />
            <div className="flex items-end gap-2">
              <Button type="submit" className="gap-2">
                Gerar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleExport}
                className="gap-2"
                disabled={report.length === 0}
              >
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : report.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum dado encontrado. Aplique filtros e clique em Gerar.
        </p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-muted/50 bg-muted/50">
                    <th className="text-left p-3 font-medium">Código</th>
                    <th className="text-left p-3 font-medium">Material</th>
                    <th className="text-left p-3 font-medium">Un</th>
                    <th className="text-left p-3 font-medium">Qtd Total</th>
                    <th className="text-left p-3 font-medium">Custo Total</th>
                    <th className="text-left p-3 font-medium">Custo Médio</th>
                    <th className="text-left p-3 font-medium">Movimentações</th>
                  </tr>
                </thead>
                <tbody>
                  {report.map((r, i) => (
                    <tr key={i} className="border-b border-muted/50 hover:bg-muted/50">
                      <td className="p-3 font-mono text-primary">{r.materialCode}</td>
                      <td className="p-3">{r.materialName}</td>
                      <td className="p-3">{r.unit}</td>
                      <td className="p-3">×{r.totalQuantity}</td>
                      <td className="p-3">{formatCents(r.totalCostCents)}</td>
                      <td className="p-3">{formatCents(r.avgCostCents)}</td>
                      <td className="p-3 text-muted-foreground text-[11px] max-w-xs truncate">
                        {r.movements.map((m) => `${m.type} ×${m.quantity} → ${m.destination ?? "—"}${m.location ? ` @ ${m.location}` : ""}${m.nfNumber ? ` (NF ${m.nfNumber})` : ""}`).join("; ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}