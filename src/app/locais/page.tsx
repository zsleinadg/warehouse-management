"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCanEdit } from "@/hooks/use-me";
import { apiErrorMessage } from "@/lib/api-client";

interface Location {
  id: string;
  name: string;
  parentId: string | null;
  disabled: boolean;
}

async function fetchLocations(): Promise<Location[]> {
  const response = await fetch("/api/locations");
  if (!response.ok) throw new Error("Failed to load locations");
  const body = await response.json();
  return body.data ?? [];
}

export default function LocaisPage() {
  const queryClient = useQueryClient();
  const canEdit = useCanEdit();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ["locations"],
    queryFn: fetchLocations,
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ["locations"] });
    void queryClient.invalidateQueries({ queryKey: ["tree"] });
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      const response = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId: parentId || undefined }),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await response.json(), "Create failed"));
    },
    onSuccess: () => {
      setName("");
      setParentId("");
      invalidate();
    },
    onError: (err: Error) => setError(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/locations/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(apiErrorMessage(await response.json(), "Remove failed"));
    },
    onSuccess: invalidate,
    onError: (err: Error) => setError(err.message),
  });

  const roots = locations.filter((l) => !l.parentId);
  const childrenOf = (id: string) => locations.filter((l) => l.parentId === id);

  function renderRow(location: Location, depth: number): React.ReactNode {
    return (
      <div key={location.id}>
        <div
          style={{ marginLeft: depth * 16 }}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px]"
        >
          <span className="flex-1">
            {location.name}
            {location.disabled && (
              <span className="ml-2 rounded-full bg-zinc-200 px-1.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300">
                desativado
              </span>
            )}
          </span>
          {canEdit && !location.disabled && (
            <button
              onClick={() => {
                if (window.confirm(`Desativar/excluir "${location.name}"?`)) {
                  removeMutation.mutate(location.id);
                }
              }}
              className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-zinc-700 dark:hover:bg-red-950"
            >
              Excluir
            </button>
          )}
        </div>
        <div>
          {childrenOf(location.id).map((child) => renderRow(child, depth + 1))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Locais</h2>

      {canEdit && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) createMutation.mutate();
          }}
          className="mb-3 flex flex-wrap gap-2 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-2.5 dark:border-zinc-700 dark:bg-black"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do local (ex.: Corredor A)"
            className="min-w-40 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
          />
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="min-w-40 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
          >
            <option value="">Sem pai (raiz)</option>
            {locations
              .filter((l) => !l.disabled)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
          <button
            type="submit"
            className="rounded-lg border border-sky-400 bg-sky-100 px-3 py-1.5 text-[13px] font-semibold text-sky-800 hover:brightness-105 dark:bg-sky-950 dark:text-sky-300"
          >
            Criar local
          </button>
          {error && <p className="w-full text-xs text-red-600">{error}</p>}
        </form>
      )}

      {isLoading ? (
        <p className="text-[13px] text-zinc-500">Carregando…</p>
      ) : (
        <div className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
          {roots.map((root) => renderRow(root, 0))}
          {roots.length === 0 && (
            <p className="px-2 py-2 text-[13px] text-zinc-500">Nenhum local cadastrado.</p>
          )}
        </div>
      )}
    </div>
  );
}
