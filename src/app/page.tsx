"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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

export default function Home() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightCode, setHighlightCode] = useState<string | null>(null);

  const { data: tree = [], isLoading } = useQuery({
    queryKey: ["tree"],
    queryFn: fetchTree,
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
    <div className="mx-auto flex h-screen max-w-5xl gap-3 p-3">
      <aside className="w-70 flex-shrink-0 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-900">
        <h1 className="mx-1.5 my-1 mb-2.5 text-base font-semibold">Almoxarifado</h1>
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
      </aside>
      <main className="flex flex-1 flex-col overflow-y-auto rounded-xl border border-zinc-200 bg-white p-3.5 dark:border-zinc-700 dark:bg-zinc-900">
        <SearchBox onJump={jump} />
        <StockList node={selected} breadcrumb={breadcrumb} highlightCode={highlightCode} />
      </main>
    </div>
  );
}
