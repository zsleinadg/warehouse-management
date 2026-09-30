"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCanEdit } from "@/hooks/use-me";
import { apiErrorMessage, formatCents } from "@/lib/api-client";

interface Material {
  id: string;
  code: string;
  name: string;
  unit: string;
  minStock: number;
  costCents: number;
  disabled: boolean;
}

async function fetchMaterials(): Promise<Material[]> {
  const response = await fetch("/api/materials");
  if (!response.ok) throw new Error("Failed to load materials");
  const body = await response.json();
  return body.data ?? [];
}

const EMPTY = { code: "", name: "", unit: "UN", minStock: 0, costCents: 0 };

export default function MateriaisPage() {
  const queryClient = useQueryClient();
  const canEdit = useCanEdit();
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ["materials"],
    queryFn: fetchMaterials,
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ["materials"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      const url = editingId ? `/api/materials/${editingId}` : "/api/materials";
      const response = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await response.json(), "Save failed"));
    },
    onSuccess: () => {
      setForm(EMPTY);
      setEditingId(null);
      invalidate();
    },
    onError: (err: Error) => setError(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async (material: Material) => {
      const response = await fetch(`/api/materials/${material.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: !material.disabled }),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await response.json(), "Update failed"));
    },
    onSuccess: invalidate,
    onError: (err: Error) => setError(err.message),
  });

  function startEdit(material: Material): void {
    setEditingId(material.id);
    setForm({
      code: material.code,
      name: material.name,
      unit: material.unit,
      minStock: material.minStock,
      costCents: material.costCents,
    });
    setError(null);
  }

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Materiais</h2>

      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
          className="mb-3 flex flex-wrap gap-2 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-2.5 dark:border-zinc-700 dark:bg-black"
        >
          <input
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder="Código (único)"
            disabled={editingId !== null}
            className="min-w-30 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800"
          />
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nome do material"
            className="min-w-30 flex-[2] rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
          />
          <input
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            placeholder="UN"
            className="w-20 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
          />
          <input
            type="number"
            min={0}
            value={form.minStock}
            onChange={(e) => setForm({ ...form, minStock: Number(e.target.value) })}
            placeholder="Mín"
            title="Estoque mínimo"
            className="w-24 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
          />
          <input
            type="number"
            min={0}
            value={form.costCents}
            onChange={(e) => setForm({ ...form, costCents: Number(e.target.value) })}
            placeholder="Custo (centavos)"
            title="Custo unitário em centavos"
            className="w-32 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
          />
          <button
            type="submit"
            className="rounded-lg border border-sky-400 bg-sky-100 px-3 py-1.5 text-[13px] font-semibold text-sky-800 hover:brightness-105 dark:bg-sky-950 dark:text-sky-300"
          >
            {editingId ? "Atualizar" : "Cadastrar"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(EMPTY);
              }}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-[13px] dark:border-zinc-700"
            >
              Cancelar
            </button>
          )}
          {error && <p className="w-full text-xs text-red-600">{error}</p>}
        </form>
      )}

      {isLoading ? (
        <p className="text-[13px] text-zinc-500">Carregando…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-zinc-50 text-left dark:bg-black">
                <th className="px-2.5 py-1.5 font-medium">Código</th>
                <th className="px-2.5 py-1.5 font-medium">Nome</th>
                <th className="px-2.5 py-1.5 font-medium">Un</th>
                <th className="px-2.5 py-1.5 font-medium">Mín</th>
                <th className="px-2.5 py-1.5 font-medium">Custo</th>
                <th className="px-2.5 py-1.5 font-medium">Status</th>
                {canEdit && <th className="px-2.5 py-1.5 font-medium">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {materials.map((m) => (
                <tr key={m.id} className="border-t border-zinc-200 dark:border-zinc-700">
                  <td className="px-2.5 py-1.5 font-mono font-semibold text-sky-800 dark:text-sky-300">
                    {m.code}
                  </td>
                  <td className="px-2.5 py-1.5">{m.name}</td>
                  <td className="px-2.5 py-1.5">{m.unit}</td>
                  <td className="px-2.5 py-1.5">{m.minStock}</td>
                  <td className="px-2.5 py-1.5">{formatCents(m.costCents)}</td>
                  <td className="px-2.5 py-1.5">
                    {m.disabled ? (
                      <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                        inativo
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                        ativo
                      </span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-2.5 py-1.5">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => startEdit(m)}
                          className="rounded-md border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => toggleMutation.mutate(m)}
                          className="rounded-md border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        >
                          {m.disabled ? "Ativar" : "Desativar"}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
