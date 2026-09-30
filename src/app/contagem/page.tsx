"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCanEdit } from "@/hooks/use-me";
import { apiErrorMessage } from "@/lib/api-client";
import { findNode, type TreeNode } from "@/lib/warehouse";

async function fetchTree(): Promise<TreeNode[]> {
  const response = await fetch("/api/locations/tree");
  if (!response.ok) throw new Error("Failed to load locations");
  const body = await response.json();
  return body.data ?? [];
}

function flatten(nodes: TreeNode[], prefix: string[] = []): { id: string; path: string }[] {
  const out: { id: string; path: string }[] = [];
  for (const node of nodes) {
    const path = [...prefix, node.name];
    out.push({ id: node.id, path: path.join(" → ") });
    out.push(...flatten(node.children, path));
  }
  return out;
}

export default function ContagemPage() {
  const queryClient = useQueryClient();
  const canEdit = useCanEdit();
  const [locationId, setLocationId] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: tree = [] } = useQuery({ queryKey: ["tree"], queryFn: fetchTree });
  const options = useMemo(() => flatten(tree), [tree]);
  const node = locationId ? findNode(tree, locationId) : null;

  const countMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      setResult(null);
      if (!node) return;
      const items = node.stocks.map((stock) => ({
        materialId: stock.material.id ?? "",
        countedQuantity: counts[stock.id] ?? stock.quantity,
      }));
      const response = await fetch("/api/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId: node.id, reason, items }),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await response.json(), "Count failed"));
      return response.json();
    },
    onSuccess: (body) => {
      const adjustments = body?.data?.adjustments ?? [];
      setResult(
        adjustments.length === 0
          ? "Contagem sem divergências."
          : `${adjustments.length} divergência(s) ajustada(s).`,
      );
      setCounts({});
      void queryClient.invalidateQueries({ queryKey: ["tree"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Contagem cíclica</h2>

      <div className="mb-3 flex flex-wrap gap-2">
        <select
          value={locationId}
          onChange={(e) => {
            setLocationId(e.target.value);
            setCounts({});
            setResult(null);
          }}
          className="min-w-60 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
        >
          <option value="">Selecione a localização…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.path}
            </option>
          ))}
        </select>
      </div>

      {!node ? (
        <p className="text-[13px] text-zinc-500">Escolha uma localização para contar.</p>
      ) : node.stocks.length === 0 ? (
        <p className="text-[13px] text-zinc-500">Nenhum item nesta localização.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            countMutation.mutate();
          }}
        >
          <div className="mb-2 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-zinc-50 text-left dark:bg-black">
                  <th className="px-2.5 py-1.5 font-medium">Material</th>
                  <th className="px-2.5 py-1.5 font-medium">Sistema</th>
                  <th className="px-2.5 py-1.5 font-medium">Contado</th>
                </tr>
              </thead>
              <tbody>
                {node.stocks.map((stock) => (
                  <tr key={stock.id} className="border-t border-zinc-200 dark:border-zinc-700">
                    <td className="px-2.5 py-1.5">
                      <span className="mr-1.5 font-mono font-semibold text-sky-800 dark:text-sky-300">
                        {stock.material.code}
                      </span>
                      {stock.material.name}
                    </td>
                    <td className="px-2.5 py-1.5">×{stock.quantity}</td>
                    <td className="px-2.5 py-1.5">
                      <input
                        type="number"
                        min={0}
                        disabled={!canEdit}
                        value={counts[stock.id] ?? stock.quantity}
                        onChange={(e) =>
                          setCounts((prev) => ({ ...prev, [stock.id]: Number(e.target.value) }))
                        }
                        className="w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motivo do ajuste (obrigatório)"
                className="min-w-60 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
              />
              <button
                type="submit"
                className="rounded-lg border border-sky-400 bg-sky-100 px-3 py-1.5 text-[13px] font-semibold text-sky-800 hover:brightness-105 dark:bg-sky-950 dark:text-sky-300"
              >
                Lançar contagem
              </button>
            </div>
          )}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          {result && <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">{result}</p>}
        </form>
      )}
    </div>
  );
}
