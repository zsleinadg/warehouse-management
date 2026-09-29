"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import LocationTree from "@/components/location-tree";
import SearchBox from "@/components/search-box";
import StockList from "@/components/stock-list";
import { findIdPath, findNamePath, findNode, type TreeNode } from "@/lib/warehouse";

async function fetchTree(): Promise<TreeNode[]> {
  const response = await fetch("/api/locations/tree");
  if (!response.ok) throw new Error("Failed to load locations");
  const body = await response.json();
  return body.data ?? [];
}

interface Me {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "OPERATOR" | "VIEWER";
}

async function fetchMe(): Promise<Me | null> {
  const response = await fetch("/api/auth/me");
  if (!response.ok) return null;
  const body = await response.json();
  return body.data ?? null;
}

function apiErrorMessage(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === "object" &&
    "errors" in body &&
    Array.isArray(body.errors) &&
    body.errors.length > 0 &&
    typeof body.errors[0]?.message === "string"
  ) {
    return body.errors[0].message;
  }
  return fallback;
}

export default function Home() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightCode, setHighlightCode] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: tree = [], isLoading } = useQuery({
    queryKey: ["tree"],
    queryFn: fetchTree,
  });
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: fetchMe });
  const canEdit = me?.role === "ADMIN" || me?.role === "OPERATOR";

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ["tree"] });
  }

  const moveMutation = useMutation({
    mutationFn: async ({ stockId, position }: { stockId: string; position: number }) => {
      const response = await fetch(`/api/stocks/${stockId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position }),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await response.json(), "Move failed"));
    },
    onSuccess: invalidate,
  });

  const addMutation = useMutation({
    mutationFn: async ({ code, name }: { code: string; name: string }) => {
      if (!selectedId) return;
      setFormError(null);
      const response = await fetch("/api/stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId: selectedId, code, name }),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await response.json(), "Add failed"));
    },
    onSuccess: invalidate,
    onError: (error: Error) => setFormError(error.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (stockId: string) => {
      const response = await fetch(`/api/stocks/${stockId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Remove failed");
    },
    onSuccess: invalidate,
  });

  async function logout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function toggle(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function select(id: string): void {
    setSelectedId(id);
    setHighlightCode(null);
  }

  function jump(locationId: string, code: string): void {
    const idPath = findIdPath(tree, locationId);
    if (idPath) setExpanded((prev) => new Set([...prev, ...idPath]));
    setSelectedId(locationId);
    setHighlightCode(code);
  }

  const selected = selectedId ? findNode(tree, selectedId) : null;
  const breadcrumb = selectedId ? (findNamePath(tree, selectedId) ?? []) : [];

  return (
    <div className="mx-auto flex h-screen max-w-5xl gap-3 p-3">
      <aside className="flex w-70 flex-shrink-0 flex-col overflow-y-auto rounded-xl border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-900">
        <h1 className="mx-1.5 my-1 mb-2.5 text-base font-semibold">Almoxarifado</h1>
        <div className="flex-1">
          {isLoading ? (
            <p className="px-1 py-2 text-[13px] text-zinc-500">Carregando…</p>
          ) : (
            <LocationTree
              nodes={tree}
              expanded={expanded}
              selectedId={selectedId}
              onToggle={toggle}
              onSelect={select}
            />
          )}
        </div>
        {me && (
          <div className="mt-2 flex items-center justify-between border-t border-zinc-200 px-1.5 pt-2 text-xs text-zinc-500 dark:border-zinc-700">
            <span>
              {me.name} · {me.role}
            </span>
            <button onClick={logout} className="font-medium hover:text-zinc-800 dark:hover:text-zinc-200">
              Sair
            </button>
          </div>
        )}
      </aside>
      <main className="flex flex-1 flex-col overflow-y-auto rounded-xl border border-zinc-200 bg-white p-3.5 dark:border-zinc-700 dark:bg-zinc-900">
        <SearchBox onJump={jump} />
        <StockList
          key={selectedId ?? "none"}
          node={selected}
          breadcrumb={breadcrumb}
          highlightCode={highlightCode}
          canEdit={canEdit}
          onMove={(stockId, targetIndex) => moveMutation.mutate({ stockId, position: targetIndex })}
          onAdd={(code, name) => addMutation.mutate({ code, name })}
          onRemove={(stockId, label) => {
            if (window.confirm(`Remover "${label}" desta localização?`)) {
              removeMutation.mutate(stockId);
            }
          }}
          formError={formError}
        />
      </main>
    </div>
  );
}
