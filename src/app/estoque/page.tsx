"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import LocationTree from "@/components/location-tree";
import SearchBox from "@/components/search-box";
import StockList from "@/components/stock-list";
import { useCanEdit } from "@/hooks/use-me";
import { apiErrorMessage } from "@/lib/api-client";
import { findIdPath, findNamePath, findNode, type TreeNode } from "@/lib/warehouse";

async function fetchTree(): Promise<TreeNode[]> {
  const response = await fetch("/api/locations/tree");
  if (!response.ok) throw new Error("Failed to load locations");
  const body = await response.json();
  return body.data ?? [];
}

export default function EstoquePage() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightCode, setHighlightCode] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: tree = [], isLoading } = useQuery({
    queryKey: ["tree"],
    queryFn: fetchTree,
  });
  const canEdit = useCanEdit();

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
    <div className="flex gap-3">
      <div className="w-64 flex-shrink-0">
        <h2 className="mb-2 text-sm font-semibold">Localizações</h2>
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
      <div className="flex-1">
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
      </div>
    </div>
  );
}
