"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import LocationTree from "@/components/location-tree";
import SearchBox from "@/components/search-box";
import StockList from "@/components/stock-list";
import { useCanEdit } from "@/hooks/use-me";
import { apiErrorMessage, safeJson } from "@/lib/api-client";
import { findIdPath, findNamePath, findNode, type TreeNode } from "@/lib/warehouse";
import { toast } from "sonner";

async function fetchTree(): Promise<TreeNode[]> {
  const response = await fetch("/api/locations/tree");
  if (!response.ok) throw new Error("Failed to load locations");
  const body = await safeJson(response);
  return (body as { data?: TreeNode[] })?.data ?? [];
}

export default function EstoquePage() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightCode, setHighlightCode] = useState<string | null>(null);
  const [placePrefill, setPlacePrefill] = useState<{ code: string; name: string; nonce: number } | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const { data: tree = [], isLoading } = useQuery({
    queryKey: ["tree"],
    queryFn: fetchTree,
  });
  const canEdit = useCanEdit();

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ["tree"] });
    void queryClient.invalidateQueries({ queryKey: ["search"] });
  }

  const moveMutation = useMutation({
    mutationFn: async ({ stockId, position }: { stockId: string; position: number }) => {
      const response = await fetch(`/api/stocks/${stockId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position }),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), "Move failed"));
    },
    onSuccess: invalidate,
    onError: (err: Error) => toast.error(err.message),
  });

  const addMutation = useMutation({
    mutationFn: async ({
      code,
      name,
      locationId,
    }: {
      code: string;
      name: string;
      locationId: string;
    }) => {
      const response = await fetch("/api/stocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Vínculo inicial sempre zerado (plaquinha do local); o saldo entra via Entradas (NF).
        body: JSON.stringify({ locationId, code, name, quantity: 0 }),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), "Add failed"));
    },
    onSuccess: () => {
      setAddError(null);
      setPlacePrefill(null);
      invalidate();
      toast.success("Material vinculado ao local (0 un)");
    },
    onError: (err: Error) => {
      setAddError(err.message);
      toast.error(err.message);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (stockId: string) => {
      const response = await fetch(`/api/stocks/${stockId}`, { method: "DELETE" });
      if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), "Remove failed"));
    },
    onSuccess: () => {
      invalidate();
      toast.success("Item removido do estoque");
    },
    onError: (err: Error) => toast.error(err.message),
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
    setAddError(null);
  }

  function jump(locationId: string, code: string): void {
    const idPath = findIdPath(tree, locationId);
    if (idPath) setExpanded((prev) => new Set([...prev, ...idPath]));
    setSelectedId(locationId);
    setHighlightCode(code);
  }

  function handleAdd(code: string, name: string): void {
    if (!selectedId) {
      const message = "Selecione um local na árvore antes de vincular o material.";
      setAddError(message);
      toast.error(message);
      return;
    }
    addMutation.mutate({ code, name, locationId: selectedId });
  }

  function handlePlace(code: string, name: string): void {
    setPlacePrefill({ code, name, nonce: Date.now() });
    if (!selectedId) {
      toast.message("Material pronto — agora selecione o local destino na árvore.");
    }
  }

  const selected = selectedId ? findNode(tree, selectedId) : null;
  const breadcrumb = selectedId ? (findNamePath(tree, selectedId) ?? []) : [];

  return (
    <div className="space-y-4">
      <h2 className="mb-1 text-lg font-semibold">Estoque</h2>
      <div className="flex flex-col gap-3 md:flex-row">
        <div className="w-full flex-shrink-0 md:w-64">
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
          <SearchBox onJump={jump} onPlace={handlePlace} />
          <StockList
            key={`${selectedId ?? "none"}::${placePrefill?.nonce ?? 0}`}
            node={selected}
            breadcrumb={breadcrumb}
            highlightCode={highlightCode}
            canEdit={canEdit}
            onMove={(stockId, targetIndex) => moveMutation.mutate({ stockId, position: targetIndex })}
            isMoving={moveMutation.isPending}
            movingId={moveMutation.isPending ? (moveMutation.variables?.stockId ?? null) : null}
            onAdd={handleAdd}
            onRemove={(stockId) => removeMutation.mutate(stockId)}
            formError={addError}
            placePrefill={placePrefill}
            isSaving={addMutation.isPending}
          />
        </div>
      </div>
    </div>
  );
}