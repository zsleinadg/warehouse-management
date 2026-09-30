"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCanEdit } from "@/hooks/use-me";
import { apiErrorMessage } from "@/lib/api-client";

interface CatalogMaterial {
  id: string;
  code: string;
  name: string;
  unit: string;
  disabled: boolean;
}

interface IssueItem {
  quantity: number;
  fulfilledQuantity: number;
  material: { code: string; name: string; unit: string };
}

interface Issue {
  id: string;
  number: number;
  ot: string | null;
  destination: string;
  foreman: string | null;
  status: "DRAFT" | "CLOSED" | "CANCELLED";
  createdAt: string;
  user?: { name: string } | null;
  items: IssueItem[];
}

interface IssueDetail extends Issue {
  notes: string | null;
  updatedAt: string;
  returns: { id: string; number: number; reason: string; createdAt: string }[];
}

async function fetchIssues(status: string): Promise<Issue[]> {
  const response = await fetch(`/api/issues${status ? `?status=${status}` : ""}`);
  if (!response.ok) throw new Error("Failed to load issues");
  const body = await response.json();
  return body.data ?? [];
}

async function fetchCatalog(): Promise<CatalogMaterial[]> {
  const response = await fetch("/api/materials");
  if (!response.ok) throw new Error("Failed to load catalog");
  const body = await response.json();
  return (body.data ?? []).filter((m: CatalogMaterial) => !m.disabled);
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  CLOSED: "Atendida",
  CANCELLED: "Cancelada",
};

export default function SaidasPage() {
  const queryClient = useQueryClient();
  const canEdit = useCanEdit();
  const [statusFilter, setStatusFilter] = useState("");
  const [ot, setOt] = useState("");
  const [destination, setDestination] = useState("");
  const [foreman, setForeman] = useState("");
  const [draftItems, setDraftItems] = useState<{ materialId: string; quantity: number }[]>([
    { materialId: "", quantity: 1 },
  ]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: issues = [] } = useQuery({
    queryKey: ["issues", statusFilter],
    queryFn: () => fetchIssues(statusFilter),
  });
  const { data: catalog = [] } = useQuery({ queryKey: ["materials"], queryFn: fetchCatalog });
  const { data: detail } = useQuery({
    queryKey: ["issue", selectedId],
    queryFn: async (): Promise<IssueDetail | null> => {
      if (!selectedId) return null;
      const response = await fetch(`/api/issues/${selectedId}`);
      if (!response.ok) throw new Error("Failed to load issue");
      const body = await response.json();
      return body.data;
    },
    enabled: selectedId !== null,
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ["issues"] });
    void queryClient.invalidateQueries({ queryKey: ["issue", selectedId] });
    void queryClient.invalidateQueries({ queryKey: ["tree"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      const response = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ot: ot || undefined, destination, foreman: foreman || undefined, items: draftItems }),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await response.json(), "Create failed"));
      return response.json();
    },
    onSuccess: (body) => {
      setOt("");
      setDestination("");
      setForeman("");
      setDraftItems([{ materialId: "", quantity: 1 }]);
      setSelectedId(body.data.id);
      invalidate();
    },
    onError: (err: Error) => setError(err.message),
  });

  const actionMutation = useMutation({
    mutationFn: async (action: "close" | "cancel") => {
      if (!selectedId) return;
      setError(null);
      const response = await fetch(`/api/issues/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await response.json(), `${action} failed`));
    },
    onSuccess: invalidate,
    onError: (err: Error) => setError(err.message),
  });

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Saídas · Requisições e OT</h2>

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
              value={ot}
              onChange={(e) => setOt(e.target.value)}
              placeholder="OT / obra (ex.: OT-123)"
              className="min-w-30 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
            />
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Destino / setor"
              className="min-w-40 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
            />
            <input
              value={foreman}
              onChange={(e) => setForeman(e.target.value)}
              placeholder="Encarregado"
              className="min-w-30 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>
          {draftItems.map((item, i) => (
            <div key={i} className="mb-2 flex flex-wrap gap-2">
              <select
                value={item.materialId}
                onChange={(e) =>
                  setDraftItems((prev) => prev.map((d, j) => (j === i ? { ...d, materialId: e.target.value } : d)))
                }
                className="min-w-40 flex-[2] rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="">Material…</option>
                {catalog.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={item.quantity}
                onChange={(e) =>
                  setDraftItems((prev) => prev.map((d, j) => (j === i ? { ...d, quantity: Number(e.target.value) } : d)))
                }
                title="Quantidade"
                className="w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
              />
              {draftItems.length > 1 && (
                <button
                  type="button"
                  onClick={() => setDraftItems((prev) => prev.filter((_, j) => j !== i))}
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
              onClick={() => setDraftItems((prev) => [...prev, { materialId: "", quantity: 1 }])}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-[13px] dark:border-zinc-700"
            >
              + Item
            </button>
            <button
              type="submit"
              className="rounded-lg border border-sky-400 bg-sky-100 px-3 py-1.5 text-[13px] font-semibold text-sky-800 hover:brightness-105 dark:bg-sky-950 dark:text-sky-300"
            >
              Abrir requisição
            </button>
          </div>
          {error && <p className="mt-2 w-full text-xs text-red-600">{error}</p>}
          <p className="mt-1.5 text-[11px] text-zinc-500">
            O rascunho não movimenta estoque. O atendimento acontece ao fechar, com parcial permitido.
          </p>
        </form>
      )}

      <div className="mb-2 flex gap-2 text-[13px]">
        {(["", "DRAFT", "CLOSED", "CANCELLED"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-md border px-2 py-1 ${
              statusFilter === s
                ? "border-sky-400 bg-sky-100 font-semibold dark:bg-sky-950"
                : "border-zinc-200 dark:border-zinc-700"
            }`}
          >
            {s === "" ? "Todas" : STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <div className="w-72 flex-shrink-0">
          {issues.map((issue) => (
            <button
              key={issue.id}
              onClick={() => setSelectedId(issue.id)}
              className={`mb-1.5 block w-full rounded-lg border px-2.5 py-2 text-left text-[13px] ${
                selectedId === issue.id
                  ? "border-sky-400 bg-sky-100 dark:bg-sky-950"
                  : "border-zinc-200 dark:border-zinc-700"
              }`}
            >
              <span className="font-mono font-semibold">#{issue.number}</span>
              {issue.ot && <span className="ml-1.5 font-semibold">{issue.ot}</span>}
              <span className="ml-1.5 rounded-full bg-zinc-200 px-1.5 text-[10px] font-semibold dark:bg-zinc-700">
                {STATUS_LABEL[issue.status]}
              </span>
              <span className="block text-xs text-zinc-500">
                {issue.destination} · {issue.items.length} itens
              </span>
            </button>
          ))}
          {issues.length === 0 && <p className="text-[13px] text-zinc-500">Nenhuma requisição.</p>}
        </div>
        <div className="flex-1">
          {!detail ? (
            <p className="text-[13px] text-zinc-500">Selecione uma requisição.</p>
          ) : (
            <div>
              <h3 className="mb-1 text-sm font-semibold">
                Requisição #{detail.number}
                {detail.ot && ` · ${detail.ot}`} · {STATUS_LABEL[detail.status]}
              </h3>
              <p className="mb-2 text-xs text-zinc-500">
                {detail.destination}
                {detail.foreman && ` · Encarregado: ${detail.foreman}`}
                {detail.user && ` · Por: ${detail.user.name}`}
              </p>
              <div className="mb-2 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-zinc-50 text-left dark:bg-black">
                      <th className="px-2.5 py-1.5 font-medium">Material</th>
                      <th className="px-2.5 py-1.5 font-medium">Pedido</th>
                      <th className="px-2.5 py-1.5 font-medium">Atendido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((item, i) => (
                      <tr key={i} className="border-t border-zinc-200 dark:border-zinc-700">
                        <td className="px-2.5 py-1.5">
                          <span className="mr-1.5 font-mono font-semibold text-sky-800 dark:text-sky-300">
                            {item.material.code}
                          </span>
                          {item.material.name}
                        </td>
                        <td className="px-2.5 py-1.5">×{item.quantity}</td>
                        <td className="px-2.5 py-1.5">
                          ×{item.fulfilledQuantity}
                          {detail.status === "CLOSED" && item.fulfilledQuantity < item.quantity && (
                            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                              parcial
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {canEdit && detail.status === "DRAFT" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => actionMutation.mutate("close")}
                    className="rounded-lg border border-emerald-400 bg-emerald-100 px-3 py-1.5 text-[13px] font-semibold text-emerald-800 hover:brightness-105 dark:bg-emerald-950 dark:text-emerald-300"
                  >
                    Atender (fechar)
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Cancelar a requisição #${detail.number}?`)) {
                        actionMutation.mutate("cancel");
                      }
                    }}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-[13px] text-red-700 dark:border-zinc-700"
                  >
                    Cancelar
                  </button>
                </div>
              )}
              {detail.returns.length > 0 && (
                <p className="mt-2 text-xs text-zinc-500">
                  Devoluções: {detail.returns.map((r) => `#${r.number}`).join(", ")}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
