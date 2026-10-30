"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import LocationTree from "@/components/location-tree";
import SearchBox from "@/components/search-box";
import StockList from "@/components/stock-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

interface SummaryStats {
  totalLocations: number;
  totalItems: number;
  totalQuantity: number;
  emptyLocations: number;
  needsReview: number;
}

export default function EstoquePage() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightCode, setHighlightCode] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "summary">("list");

  const { data: tree = [], isLoading } = useQuery({
    queryKey: ["tree"],
    queryFn: fetchTree,
  });
  const canEdit = useCanEdit();

  // Summary stats computed from the tree
  const stats: SummaryStats = useMemo(() => {
    let totalLocations = 0;
    let totalItems = 0;
    let totalQuantity = 0;
    let emptyLocations = 0;
    let needsReview = 0;

    function walk(nodes: TreeNode[]): void {
      for (const node of nodes) {
        totalLocations++;
        const stockCount = node.stocks.length;
        totalItems += stockCount;
        totalQuantity += node.stocks.reduce((sum, s) => sum + Number(s.quantity), 0);
        if (stockCount === 0) emptyLocations++;
        needsReview += node.stocks.filter((s) => s.needsReview).length;
        if (node.children.length > 0) walk(node.children);
      }
    }
    walk(tree);

    return { totalLocations, totalItems, totalQuantity, emptyLocations, needsReview };
  }, [tree]);

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
  }

  function jump(locationId: string, code: string): void {
    const idPath = findIdPath(tree, locationId);
    if (idPath) setExpanded((prev) => new Set([...prev, ...idPath]));
    setSelectedId(locationId);
    setHighlightCode(code);
  }

  const selected = selectedId ? findNode(tree, selectedId) : null;
  const breadcrumb = selectedId ? (findNamePath(tree, selectedId) ?? []) : [];

  // Stocks of the selected location (for quick stats in header)
  const selectedStocks = selected?.stocks ?? [];
  const selectedTotalQty = selectedStocks.reduce((sum, s) => sum + Number(s.quantity), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Estoque</h1>
          <p className="text-xs text-muted-foreground">
            Gerencie materiais por localização. O saldo entra via Entradas (NF).
          </p>
        </div>
        <div className="flex gap-2 sm:gap-3">
          <ButtonViewMode viewMode={viewMode} onChange={(v) => setViewMode(v as "list" | "summary")} />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard label="Localizações" value={stats.totalLocations} subtitle={stats.emptyLocations > 0 ? `${stats.emptyLocations} vazias` : "todas com itens"} />
        <StatCard label="Itens vinculados" value={stats.totalItems} />
        <StatCard label="Total unidades" value={stats.totalQuantity} />
        <StatCard label="Pend. auditoria" value={stats.needsReview} variant={stats.needsReview > 0 ? "destructive" : "secondary"} />
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-shrink-0 lg:w-[320px]">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Localizações</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
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
            </CardContent>
          </Card>
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
            onRemove={(stockId) => removeMutation.mutate(stockId)}
            isMoving={moveMutation.isPending}
            movingId={moveMutation.isPending ? (moveMutation.variables?.stockId ?? null) : null}
            selectedTotalQty={selectedTotalQty}
            viewMode={viewMode}
          />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtitle,
  variant,
}: {
  label: string;
  value: number | string;
  subtitle?: string;
  variant?: "default" | "secondary" | "destructive" | "outline";
}) {
  const variantClasses = {
    default: "bg-muted border-muted/50",
    secondary: "bg-zinc-100 border-zinc-200 dark:bg-zinc-800 dark:border-zinc-700",
    destructive: "bg-red-50 border-red-100 dark:bg-red-950 dark:border-red-900",
    outline: "border border-zinc-200 dark:border-zinc-700",
  };

  return (
    <Card className="border-sm p-3">
      <CardContent className="p-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</span>
          {subtitle && (
            <span className="ml-auto text-[11px] text-muted-foreground">{subtitle}</span>
          )}
        </div>
        <div className="flex items-baseline gap-1 mt-1">
          <span className={`text-lg font-semibold ${
            variant === "destructive" ? "text-red-600 dark:text-red-400" : "text-foreground"
          }`}>{value}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function ButtonViewMode({ viewMode, onChange }: { viewMode: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900 p-0.5">
      <button
        onClick={() => onChange("list")}
        className={`px-2 py-1 text-[11px] rounded-md transition-colors ${
          viewMode === "list" ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        }`}
        title="Lista"
      >
        ☰
      </button>
      <button
        onClick={() => onChange("summary")}
        className={`px-2 py-1 text-[11px] rounded-md transition-colors ${
          viewMode === "summary" ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        }`}
        title="Resumo"
      >
        ⟡
      </button>
    </div>
  );
}
