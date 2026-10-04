"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FormInput, FormSelect, type FormSelectOption } from "@/components/ui/forms";
import { Card, CardContent } from "@/components/ui/card";

interface Movement {
  id: string;
  type: "INBOUND" | "OUTBOUND" | "TRANSFER" | "ADJUSTMENT" | "RETURN";
  quantity: number;
  destination: string | null;
  nfNumber: string | null;
  reason: string | null;
  issueId: string | null;
  returnId: string | null;
  createdAt: string;
  material: { code: string; name: string; unit: string };
  user: { name: string } | null;
}

const TYPE_LABEL: Record<string, string> = {
  INBOUND: "Entrada",
  OUTBOUND: "Saída",
  TRANSFER: "Transferência",
  ADJUSTMENT: "Ajuste",
  RETURN: "Devolução",
};

const TYPE_COLOR: Record<string, string> = {
  INBOUND: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  OUTBOUND: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  TRANSFER: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200",
  ADJUSTMENT: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  RETURN: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200",
};

async function fetchMovements(params: URLSearchParams): Promise<Movement[]> {
  const response = await fetch(`/api/movements?${params.toString()}`);
  if (!response.ok) throw new Error("Failed to load movements");
  const body = await response.json();
  return body.data ?? [];
}

const typeOptions: FormSelectOption[] = [
  { value: "", label: "Todos os tipos" },
  { value: "INBOUND", label: "Entrada" },
  { value: "OUTBOUND", label: "Saída" },
  { value: "TRANSFER", label: "Transferência" },
  { value: "ADJUSTMENT", label: "Ajuste" },
  { value: "RETURN", label: "Devolução" },
];

const takeOptions: FormSelectOption[] = [
  { value: "50", label: "50" },
  { value: "100", label: "100" },
  { value: "200", label: "200" },
  { value: "500", label: "500" },
];

export default function AuditoriaPage() {
  const [type, setType] = useState("");
  const [materialCode, setMaterialCode] = useState("");
  const [nfNumber, setNfNumber] = useState("");
  const [issueId, setIssueId] = useState("");
  const [take, setTake] = useState("100");

  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (materialCode) params.set("materialCode", materialCode);
  if (nfNumber) params.set("nfNumber", nfNumber);
  if (issueId) params.set("issueId", issueId);
  params.set("take", take);

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["movements", params.toString()],
    queryFn: () => fetchMovements(params),
  });

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Auditoria</h2>

      <div className="mb-3 flex flex-wrap gap-2">
        <FormSelect
          value={type}
          onValueChange={setType}
          label="Tipo"
          options={typeOptions}
          className="min-w-32"
        />
        <FormInput
          value={materialCode}
          onChange={(e) => setMaterialCode(e.target.value)}
          label="Código do material"
          placeholder="Código do material"
          className="min-w-32"
        />
        <FormInput
          value={nfNumber}
          onChange={(e) => setNfNumber(e.target.value)}
          label="Número NF"
          placeholder="Número NF"
          className="min-w-32"
        />
        <FormInput
          value={issueId}
          onChange={(e) => setIssueId(e.target.value)}
          label="Issue ID"
          placeholder="Issue ID"
          className="min-w-32"
        />
        <FormSelect
          value={take}
          onValueChange={setTake}
          label="Limite"
          options={takeOptions}
          className="w-24"
        />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : movements.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma movimentação encontrada.</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-muted/50 bg-muted/50">
                    <th className="text-left p-3 font-medium">Tipo</th>
                    <th className="text-left p-3 font-medium">Material</th>
                    <th className="text-left p-3 font-medium">Qtd</th>
                    <th className="text-left p-3 font-medium">Destino / NF / Motivo</th>
                    <th className="text-left p-3 font-medium">Refs</th>
                    <th className="text-left p-3 font-medium">Por</th>
                    <th className="text-left p-3 font-medium">Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id} className="border-b border-muted/50 hover:bg-muted/50">
                      <td className="p-3">
                        <span className={`rounded-full px-1.5 text-[10px] font-semibold ${TYPE_COLOR[m.type]}`}>
                          {TYPE_LABEL[m.type]}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="font-mono text-primary mr-2">{m.material.code}</span>
                        {m.material.name}
                      </td>
                      <td className="p-3">×{m.quantity} {m.material.unit}</td>
                      <td className="p-3 text-muted-foreground">
                        {m.destination ?? m.nfNumber ?? m.reason ?? "—"}
                      </td>
                      <td className="p-3 text-muted-foreground text-[11px] font-mono">
                        {m.issueId ? `Issue ${m.issueId.slice(0, 8)}…` : m.returnId ? `Ret ${m.returnId.slice(0, 8)}…` : "—"}
                      </td>
                      <td className="p-3 text-muted-foreground">{m.user?.name ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">
                        {new Date(m.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
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