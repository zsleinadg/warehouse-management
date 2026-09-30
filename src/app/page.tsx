"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatCents } from "@/lib/api-client";

interface DashboardData {
  materialsCount: number;
  locationsCount: number;
  openIssues: number;
  totalQuantity: number;
  valuationCents: number;
  lowStockCount: number;
  lowStock: {
    code: string;
    name: string;
    unit: string;
    quantity: number;
    minStock: number;
  }[];
  recentMovements: {
    id: string;
    type: string;
    quantity: number;
    destination: string | null;
    nfNumber: string | null;
    createdAt: string;
    material: { code: string; name: string };
    user: { name: string } | null;
  }[];
}

async function fetchDashboard(): Promise<DashboardData> {
  const response = await fetch("/api/dashboard");
  if (!response.ok) throw new Error("Failed to load dashboard");
  const body = await response.json();
  return body.data;
}

const TYPE_LABEL: Record<string, string> = {
  INBOUND: "Entrada",
  OUTBOUND: "Saída",
  TRANSFER: "Transferência",
  ADJUSTMENT: "Ajuste",
  RETURN: "Devolução",
};

export default function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard });

  if (isLoading || !data) {
    return <p className="px-1 py-2 text-[13px] text-zinc-500">Carregando…</p>;
  }

  const cards = [
    { label: "Materiais ativos", value: String(data.materialsCount), href: "/materiais" },
    { label: "Localizações", value: String(data.locationsCount), href: "/locais" },
    { label: "Unidades em estoque", value: String(data.totalQuantity), href: "/estoque" },
    { label: "Valorização", value: formatCents(data.valuationCents), href: "/relatorios" },
    { label: "Requisições em aberto", value: String(data.openIssues), href: "/saidas" },
    { label: "Abaixo do mínimo", value: String(data.lowStockCount), href: "#baixo-estoque" },
  ];

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Dashboard</h2>
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 dark:border-zinc-700 dark:bg-black"
          >
            <p className="text-[11px] text-zinc-500">{card.label}</p>
            <p className="text-xl font-semibold">{card.value}</p>
          </Link>
        ))}
      </div>

      <h3 id="baixo-estoque" className="mb-2 text-sm font-semibold">
        Abaixo do estoque mínimo ({data.lowStockCount})
      </h3>
      {data.lowStock.length === 0 ? (
        <p className="mb-4 text-[13px] text-zinc-500">Nenhum material abaixo do mínimo.</p>
      ) : (
        <div className="mb-4 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-zinc-50 text-left dark:bg-black">
                <th className="px-2.5 py-1.5 font-medium">Código</th>
                <th className="px-2.5 py-1.5 font-medium">Material</th>
                <th className="px-2.5 py-1.5 font-medium">Saldo</th>
                <th className="px-2.5 py-1.5 font-medium">Mínimo</th>
              </tr>
            </thead>
            <tbody>
              {data.lowStock.map((item) => (
                <tr key={item.code} className="border-t border-zinc-200 dark:border-zinc-700">
                  <td className="px-2.5 py-1.5 font-mono font-semibold text-sky-800 dark:text-sky-300">
                    {item.code}
                  </td>
                  <td className="px-2.5 py-1.5">{item.name}</td>
                  <td className="px-2.5 py-1.5 text-red-700 dark:text-red-300">
                    {item.quantity} {item.unit}
                  </td>
                  <td className="px-2.5 py-1.5">
                    {item.minStock} {item.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="mb-2 text-sm font-semibold">Movimentações recentes</h3>
      {data.recentMovements.length === 0 ? (
        <p className="text-[13px] text-zinc-500">Nenhuma movimentação registrada ainda.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-zinc-50 text-left dark:bg-black">
                <th className="px-2.5 py-1.5 font-medium">Tipo</th>
                <th className="px-2.5 py-1.5 font-medium">Material</th>
                <th className="px-2.5 py-1.5 font-medium">Qtd</th>
                <th className="px-2.5 py-1.5 font-medium">Destino/NF</th>
                <th className="px-2.5 py-1.5 font-medium">Por</th>
              </tr>
            </thead>
            <tbody>
              {data.recentMovements.map((m) => (
                <tr key={m.id} className="border-t border-zinc-200 dark:border-zinc-700">
                  <td className="px-2.5 py-1.5">{TYPE_LABEL[m.type] ?? m.type}</td>
                  <td className="px-2.5 py-1.5">
                    <span className="mr-1.5 font-mono font-semibold text-sky-800 dark:text-sky-300">
                      {m.material.code}
                    </span>
                    {m.material.name}
                  </td>
                  <td className="px-2.5 py-1.5">×{m.quantity}</td>
                  <td className="px-2.5 py-1.5 text-zinc-500">{m.destination ?? m.nfNumber ?? "—"}</td>
                  <td className="px-2.5 py-1.5 text-zinc-500">{m.user?.name ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
