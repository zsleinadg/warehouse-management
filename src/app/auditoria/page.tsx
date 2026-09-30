"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

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

export default function AuditoriaPage() {
  const [type, setType] = useState("");
  const [materialCode, setMaterialCode] = useState("");
  const [nfNumber, setNfNumber] = useState("");
  const [issueId, setIssueId] = useState("");
  const [take, setTake] = useState(100);

  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (materialCode) params.set("materialCode", materialCode);
  if (nfNumber) params.set("nfNumber", nfNumber);
  if (issueId) params.set("issueId", issueId);
  params.set("take", String(take));

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["movements", params.toString()],
    queryFn: () => fetchMovements(params),
  });

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Auditoria · Movimentações</h2>

      <div className="mb-3 flex flex-wrap gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="min-w-32 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
        >
          <option value="">Todos os tipos</option>
          <option value="INBOUND">Entrada</option>
          <option value="OUTBOUND">Saída</option>
          <option value="TRANSFER">Transferência</option>
          <option value="ADJUSTMENT">Ajuste</option>
          <option value="RETURN">Devolução</option>
        </select>
        <input
          value={materialCode}
          onChange={(e) => setMaterialCode(e.target.value)}
          placeholder="Código do material"
          className="min-w-32 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
        />
        <input
          value={nfNumber}
          onChange={(e) => setNfNumber(e.target.value)}
          placeholder="Número NF"
          className="min-w-32 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
        />
        <input
          value={issueId}
          onChange={(e) => setIssueId(e.target.value)}
          placeholder="Issue ID"
          className="min-w-32 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
        />
        <select
          value={take}
          onChange={(e) => setTake(Number(e.target.value))}
          className="w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
        >
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="200">200</option>
          <option value="500">500</option>
        </select>
      </div>

      {isLoading ? (
        <p className="text-[13px] text-zinc-500">Carregando…</p>
      ) : movements.length === 0 ? (
        <p className="text-[13px] text-zinc-500">Nenhuma movimentação encontrada.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-zinc-50 text-left dark:bg-black">
                <th className="px-2.5 py-1.5 font-medium">Tipo</th>
                <th className="px-2.5 py-1.5 font-medium">Material</th>
                <th className="px-2.5 py-1.5 font-medium">Qtd</th>
                <th className="px-2.5 py-1.5 font-medium">Destino / NF / Motivo</th>
                <th className="px-2.5 py-1.5 font-medium">Refs</th>
                <th className="px-2.5 py-1.5 font-medium">Por</th>
                <th className="px-2.5 py-1.5 font-medium">Quando</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-t border-zinc-200 dark:border-zinc-700">
                  <td className="px-2.5 py-1.5">
                    <span className={`rounded-full px-1.5 text-[10px] font-semibold ${TYPE_COLOR[m.type]}`}>
                      {TYPE_LABEL[m.type]}
                    </span>
                  </td>
                  <td className="px-2.5 py-1.5">
                    <span className="mr-1.5 font-mono font-semibold text-sky-800 dark:text-sky-300">
                      {m.material.code}
                    </span>
                    {m.material.name}
                  </td>
                  <td className="px-2.5 py-1.5">×{m.quantity} {m.material.unit}</td>
                  <td className="px-2.5 py-1.5 text-zinc-500">
                    {m.destination ?? m.nfNumber ?? m.reason ?? "—"}
                  </td>
                  <td className="px-2.5 py-1.5 text-zinc-500 text-[11px] font-mono">
                    {m.issueId ? `Issue ${m.issueId.slice(0, 8)}…` : m.returnId ? `Ret ${m.returnId.slice(0, 8)}…` : "—"}
                  </td>
                  <td className="px-2.5 py-1.5 text-zinc-500">{m.user?.name ?? "—"}</td>
                  <td className="px-2.5 py-1.5 text-zinc-500">
                    {new Date(m.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
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