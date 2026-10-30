"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import LocationTree from "@/components/location-tree";
import SearchBox from "@/components/search-box";
import StockList from "@/components/stock-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
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

  // Vincular/mover material existente para o local selecionado
  const [linkCode, setLinkCode] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkFoundMaterial, setLinkFoundMaterial] = useState<{
    id: string;
    code: string;
    name: string;
    unit: string;
    currentLocation: string;
    currentLocationId: string;
    stockId: string;
    quantity: number;
  } | null>(null);

  // Busca o material na árvore de dados já carregada para obter o stockId
  function findMaterialInTree(code: string): {
    id: string;
    code: string;
    name: string;
    unit: string;
    currentLocation: string;
    currentLocationId: string;
    stockId: string;
    quantity: number;
  } | null {
    for (const node of tree) {
      const stock = node.stocks.find((s) => s.material.code.toUpperCase() === code.toUpperCase());
      if (stock) {
        return {
          id: stock.material.id,
          code: stock.material.code,
          name: stock.material.name,
          unit: stock.material.unit,
          currentLocation: node.name,
          currentLocationId: node.id,
          stockId: stock.id,
          quantity: Number(stock.quantity),
        };
      }
      type ReturnValue = {
        id: string;
        code: string;
        name: string;
        unit: string;
        currentLocation: string;
        currentLocationId: string;
        stockId: string;
        quantity: number;
      };

      // Busca recursiva em filhos
      function searchChildren(nodes: TreeNode[]): ReturnValue | null {
        for (const n of nodes) {
          const s = n.stocks.find((st) => st.material.code.toUpperCase() === code.toUpperCase());
          if (s) {
            return {
              id: s.material.id,
              code: s.material.code,
              name: s.material.name,
              unit: s.material.unit,
              currentLocation: n.name,
              currentLocationId: n.id,
              stockId: s.id,
              quantity: Number(s.quantity),
            };
          }
          if (n.children.length > 0) {
            const found = searchChildren(n.children);
            if (found) return found;
          }
        }
        return null;
      }
      const found = searchChildren(node.children);
      if (found) return found;
    }
    return null;
  }

  async function resolveMaterialByCode(code: string) {
    // Primeiro tenta encontrar na árvore já carregada (tem stockId)
    const found = findMaterialInTree(code.trim());
    if (found) return found;

    // Fallback: busca na API de materiais para confirmar existência
    const response = await fetch(`/api/materials?q=${encodeURIComponent(code.trim())}&take=5`);
    if (!response.ok) return null;
    const body = await safeJson(response);
    const data = (body as { data?: Array<{ id: string; code: string; name: string; unit: string; disabled: boolean }> })?.data ?? [];
    const exact = data.find((m) => m.code.toUpperCase() === code.trim().toUpperCase() && !m.disabled);
    if (exact) {
      return {
        id: exact.id,
        code: exact.code,
        name: exact.name,
        unit: exact.unit,
        currentLocation: "não encontrado em estoque",
        currentLocationId: "",
        stockId: "",
        quantity: 0,
      };
    }
    return null;
  }

  function handleLinkMaterial(): void {
    if (!selectedId) {
      toast.error("Selecione um local na árvore antes de vincular.");
      return;
    }
    if (!linkFoundMaterial) {
      toast.error("Material não encontrado. Digite o código e pressione Enter.");
      return;
    }

    // Se já está neste local, não precisa mover
    if (linkFoundMaterial.currentLocationId === selectedId) {
      setLinkCode("");
      setLinkLoading(false);
      setLinkFoundMaterial(null);
      toast.info("Este material já está neste local.");
      return;
    }

    setLinkLoading(true);

    // Mover o stock para o local selecionado via PATCH
    fetch(`/api/stocks/${linkFoundMaterial.stockId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId: selectedId }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await safeJson(res).catch(() => null);
          throw new Error(apiErrorMessage(body, "Falha ao mover material"));
        }
        return res.json();
      })
      .then(() => {
        setLinkCode("");
        setLinkLoading(false);
        setLinkFoundMaterial(null);
        invalidate();
        toast.success("Material movido para o local selecionado");
      })
      .catch((err) => {
        setLinkLoading(false);
        toast.error(err.message);
      });
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
    setLinkFoundMaterial(null);
    setLinkCode("");
  }

  function jump(locationId: string, code: string): void {
    const idPath = findIdPath(tree, locationId);
    if (idPath) setExpanded((prev) => new Set([...prev, ...idPath]));
    setSelectedId(locationId);
    setHighlightCode(code);
  }

  const selected = selectedId ? findNode(tree, selectedId) : null;
  const breadcrumb = selectedId ? (findNamePath(tree, selectedId) ?? []) : [];

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

          {canEdit && selectedId && selected && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-sm">Mover material para "{selected.name}"</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="flex flex-col sm:flex-row gap-2 items-end">
                  <div className="flex-1 min-w-0">
                    <Input
                      value={linkCode}
                      onChange={(e) => {
                        setLinkCode(e.target.value.toUpperCase());
                        setLinkFoundMaterial(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          setLinkLoading(true);
                          resolveMaterialByCode(linkCode).then((material) => {
                            setLinkLoading(false);
                            if (!material) {
                              setLinkFoundMaterial(null);
                              toast.error(`Material "${linkCode}" não encontrado em estoque.`);
                              return;
                            }
                            setLinkFoundMaterial(material);
                          });
                        }
                      }}
                      placeholder="Código do material (ex: 310571)"
                      className="text-[13px] font-mono"
                    />
                  </div>
                  <Button
                    onClick={handleLinkMaterial}
                    disabled={linkLoading || !linkCode.trim() || !linkFoundMaterial}
                    className="text-[13px] px-3"
                  >
                    {linkLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Mover
                  </Button>
                </div>
                {linkFoundMaterial && (
                  <div className="mt-2 p-2 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-[11px] font-semibold text-blue-800 dark:text-blue-300 mb-1">
                      {linkFoundMaterial.code} — {linkFoundMaterial.name}
                    </p>
                    <p className="text-[11px] text-blue-700 dark:text-blue-400">
                      De: {linkFoundMaterial.currentLocation} → Para: {selected.name}
                    </p>
                    <p className="text-[11px] text-blue-700 dark:text-blue-400">
                      Un: {linkFoundMaterial.unit} · Qtd: {linkFoundMaterial.quantity}
                    </p>
                  </div>
                )}
                {linkCode.trim() && !linkFoundMaterial && linkCode.length >= 2 && (
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Digite 2+ caracteres e pressione Enter para buscar o material em estoque.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

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