"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCanEdit } from "@/hooks/use-me";
import { apiErrorMessage } from "@/lib/api-client";

interface ClosedIssue {
  id: string;
  number: number;
  ot: string | null;
  destination: string;
  items: {
    quantity: number;
    fulfilledQuantity: number;
    material: { id: string; code: string; name: string; unit: string };
  }[];
}

interface LocationOption {
  id: string;
  name: string;
  disabled: boolean;
}

interface ReturnSummary {
  id: string;
  number: number;
  reason: string;
  createdAt: string;
  issue: { number: number; ot: string | null; destination: string };
  items: {
    quantity: number;
    material: { code: string; name: string; unit: string };
    location: { name: string };
  }[];
}

async function fetchClosedIssues(): Promise<ClosedIssue[]> {
  const response = await fetch("/api/issues?status=CLOSED");
  if (!response.ok) throw new Error("Failed to load issues");
  const body = await response.json();
  return body.data ?? [];
}

async function fetchReturns(): Promise<ReturnSummary[]> {
  const response = await fetch("/api/returns");
  if (!response.ok) throw new Error("Failed to load returns");
  const body = await response.json();
  return body.data ?? [];
}

async function fetchLocationOptions(): Promise<LocationOption[]> {
  const response = await fetch("/api/locations");
  if (!response.ok) throw new Error("Failed to load locations");
  const body = await response.json();
  return (body.data ?? []).filter((l: LocationOption) => !l.disabled);
}

export default function DevolucoesPage() {
  const queryClient = useQueryClient();
  const canEdit = useCanEdit();
  const [issueId, setIssueId] = useState("");
  const [reason, setReason] = useState("");
  const [items, setItems] = useState<{ materialId: string; locationId: string; quantity: number }[]>([
    { materialId: "", locationId: "", quantity: 1 },
  ]);
  const [error, setError] = useState<string | null>(null);

  const { data: issues = [] } = useQuery({ queryKey: ["issues", "CLOSED"], queryFn: fetchClosedIssues });
  const { data: returns = [] } = useQuery({ queryKey: ["returns"], queryFn: fetchReturns });
  const { data: locations = [] } = useQuery({ queryKey: ["locations"], queryFn: fetchLocationOptions });

  const selectedIssue = issues.find((i) => i.id === issueId) ?? null;

  const createMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      const response = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId, reason, items }),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await response.json(), "Create failed"));
    },
    onSuccess: () => {
      setIssueId("");
      setReason("");
      setItems([{ materialId: "", locationId: "", quantity: 1 }]);
      void queryClient.invalidateQueries({ queryKey: ["returns"] });
      void queryClient.invalidateQueries({ queryKey: ["tree"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Devoluções</h2>

      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="mb-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-2.5 dark:border-zinc-700 dark:bg-black"
        >
          <div className="mb-2 flex flex-wrap gap-2">
            <select
              value={issueId}
              onChange={(e) => setIssueId(e.target.value)}
              className="min-w-48 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="">Saída de origem…</option>
              {issues.map((i) => (
                <option key={i.id} value={i.id}>
                  #{i.number}{i.ot ? ` · ${i.ot}` : ""} — {i.destination}
                </option>
              ))}
            </select>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Motivo da devolução"
              className="min-w-48 flex-[2] rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>
          {selectedIssue && (
            <p className="mb-2 text-[11px] text-zinc-500">
              Atendido na origem:{" "}
              {selectedIssue.items
                .map((item) => `${item.material.code} ×${item.fulfilledQuantity}`)
                .join(" · ")}
            </p>
          )}
          {items.map((item, i) => (
            <div key={i} className="mb-2 flex flex-wrap gap-2">
              <select
                value={item.materialId}
                onChange={(e) =>
                  setItems((prev) => prev.map((d, j) => (j === i ? { ...d, materialId: e.target.value } : d)))
                }
                className="min-w-40 flex-[2] rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="">Material…</option>
                {(selectedIssue?.items ?? []).map((entry) => (
                  <option key={entry.material.id} value={entry.material.id}>
                    {entry.material.code} — {entry.material.name} (atendido ×{entry.fulfilledQuantity})
                  </option>
                ))}
              </select>
              <select
                value={item.locationId}
                onChange={(e) =>
                  setItems((prev) => prev.map((d, j) => (j === i ? { ...d, locationId: e.target.value } : d)))
                }
                className="min-w-40 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="">Local de retorno…</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={item.quantity}
                onChange={(e) =>
                  setItems((prev) => prev.map((d, j) => (j === i ? { ...d, quantity: Number(e.target.value) } : d)))
                }
                title="Quantidade"
                className="w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
              />
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}
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
              onClick={() => setItems((prev) => [...prev, { materialId: "", locationId: "", quantity: 1 }])}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-[13px] dark:border-zinc-700"
            >
              + Item
            </button>
            <button
              type="submit"
              className="rounded-lg border border-sky-400 bg-sky-100 px-3 py-1.5 text-[13px] font-semibold text-sky-800 hover:brightness-105 dark:bg-sky-950 dark:text-sky-300"
            >
              Registrar devolução
            </button>
          </div>
          {error && <p className="mt-2 w-full text-xs text-red-600">{error}</p>}
        </form>
      )}

      <h3 className="mb-2 text-sm font-semibold">Devoluções registradas</h3>
      {returns.length === 0 ? (
        <p className="text-[13px] text-zinc-500">Nenhuma devolução registrada.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-zinc-50 text-left dark:bg-black">
                <th className="px-2.5 py-1.5 font-medium">Nº</th>
                <th className="px-2.5 py-1.5 font-medium">Origem</th>
                <th className="px-2.5 py-1.5 font-medium">Itens</th>
                <th className="px-2.5 py-1.5 font-medium">Motivo</th>
              </tr>
            </thead>
            <tbody>
              {returns.map((r) => (
                <tr key={r.id} className="border-t border-zinc-200 dark:border-zinc-700">
                  <td className="px-2.5 py-1.5 font-mono font-semibold">#{r.number}</td>
                  <td className="px-2.5 py-1.5">
                    Saída #{r.issue.number}
                    {r.issue.ot ? ` · ${r.issue.ot}` : ""} — {r.issue.destination}
                  </td>
                  <td className="px-2.5 py-1.5">
                    {r.items.map((item, i) => (
                      <span key={i} className="mr-2">
                        {item.material.code} ×{item.quantity} → {item.location.name}
                      </span>
                    ))}
                  </td>
                  <td className="px-2.5 py-1.5 text-zinc-500">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
