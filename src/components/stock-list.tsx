"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { safeJson } from "@/lib/api-client";
import type { TreeNode } from "@/lib/warehouse";

interface StockListProps {
  node: TreeNode | null;
  breadcrumb: string[];
  highlightCode: string | null;
  canEdit: boolean;
  onMove: (stockId: string, targetIndex: number) => void;
  onRemove: (stockId: string, label: string) => void;
  isMoving?: boolean;
  movingId?: string | null;
  selectedTotalQty?: number;
  viewMode?: "list" | "summary";
}

function getQuantityStatus(quantity: number): {
  label: string;
  badge: "default" | "secondary" | "destructive";
} {
  if (quantity === 0) {
    return { label: "0 un · plaquinha", badge: "destructive" };
  }
  if (quantity < 10) {
    return { label: `×${quantity}`, badge: "secondary" };
  }
  return { label: `×${quantity}`, badge: "default" };
}

export default function StockList({
  node,
  breadcrumb,
  highlightCode,
  canEdit,
  onMove,
  onRemove,
  isMoving = false,
  movingId = null,
  selectedTotalQty = 0,
  viewMode = "list",
}: StockListProps) {
  const highlightRef = useRef<HTMLDivElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState<"all" | "with" | "zero">("all");

  // Confirm dialog state
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [stockToRemove, setStockToRemove] = useState<{ id: string; label: string } | null>(null);

  useEffect(() => {
    if (highlightCode && highlightRef.current) {
      highlightRef.current.scrollIntoView({ block: "center" });
    }
  }, [highlightCode, node?.id]);

  const filteredStocks = useMemo(() => {
    const stocks = node?.stocks ?? [];
    if (stockFilter === "with") return stocks.filter((s) => Number(s.quantity) > 0);
    if (stockFilter === "zero") return stocks.filter((s) => Number(s.quantity) === 0);
    return stocks;
  }, [node, stockFilter]);

  if (!node) {
    return (
      <div className="px-5 py-5 text-center">
        <p className="text-[13px] text-zinc-500">
          Selecione uma localização na árvore à esquerda para ver os materiais dela.
        </p>
      </div>
    );
  }

  function handleRemoveClick(stockId: string, label: string): void {
    setStockToRemove({ id: stockId, label });
    setRemoveDialogOpen(true);
  }

  function handleConfirmRemove(): void {
    if (stockToRemove) {
      onRemove(stockToRemove.id, stockToRemove.label);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-xs text-zinc-500">{breadcrumb.join(" → ")}</p>
          {node.stocks.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {filteredStocks.length} de {node.stocks.length} itens ·
              {selectedTotalQty} un total
            </span>
          )}
        </div>

        {node.stocks.length > 0 && (
          <div className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700">
            <button
              onClick={() => setStockFilter("all")}
              className={`px-2 py-0.5 rounded-sm transition-colors ${
                stockFilter === "all"
                  ? "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setStockFilter("with")}
              className={`px-2 py-0.5 rounded-sm transition-colors ${
                stockFilter === "with"
                  ? "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-300"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              Com estoque
            </button>
            <button
              onClick={() => setStockFilter("zero")}
              className={`px-2 py-0.5 rounded-sm transition-colors ${
                stockFilter === "zero"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              Apenas plaquinha
            </button>
          </div>
        )}
      </div>

      {canEdit && (
        <p className="mb-1 text-[11px] text-zinc-500">
          Arraste pelo ⋮⋮ ou use as setas ↑ ↓ para reordenar (no celular, use as setas).
        </p>
      )}

      {filteredStocks.length === 0 && (
        <div className="px-5 py-5 text-center">
          {node.stocks.length > 0 && stockFilter !== "all" ? (
            <p className="text-[13px] text-zinc-500">
              Nenhum item corresponde ao filtro selecionado.
            </p>
          ) : (
            <p className="text-[13px] text-zinc-500">
              Nenhum material vinculado a este local ainda.
            </p>
          )}
        </div>
      )}

      {filteredStocks.map((stock, index) => {
        const highlighted = highlightCode === stock.material.code;
        const isThisMoving = movingId !== null && movingId === stock.id;
        const qtyStatus = getQuantityStatus(Number(stock.quantity));

        return (
          <div
            key={stock.id}
            ref={highlighted ? highlightRef : undefined}
            title={stock.notes ?? undefined}
            draggable={canEdit}
            onDragStart={() => {
              setDragIndex(index);
              setDragId(stock.id);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setDragId(null);
            }}
            onDragOver={(e) => {
              if (canEdit) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (isMoving || dragId === null || dragId === stock.id) return;
              onMove(dragId, index);
              setDragIndex(null);
              setDragId(null);
            }}
            className={`relative mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg border bg-zinc-50 px-2.5 py-2.5 dark:bg-black ${
              highlighted ? "animate-pulse border-sky-400" : "border-zinc-200 dark:border-zinc-700"
            } ${canEdit ? "cursor-grab" : ""} ${dragIndex === index ? "opacity-40" : ""}`}>
            {canEdit && (
              <span className="hidden text-sm text-zinc-500 select-none sm:inline" aria-hidden>
                ⋮⋮
              </span>
            )}
            <span className="min-w-20 shrink-0 font-mono text-[13px] font-semibold text-sky-800 dark:text-sky-300">
              {stock.material.code}
            </span>
            <span className="min-w-0 flex-1 basis-32 truncate text-[13px]" title={stock.material.name}>
              {stock.material.name}
            </span>
            <span className="min-w-[40px] shrink-0 text-right text-xs font-mono">
              <span
                className={`text-[12px] font-semibold ${
                  qtyStatus.badge === "destructive"
                    ? "text-red-600 dark:text-red-400"
                    : qtyStatus.badge === "secondary"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-zinc-900 dark:text-zinc-100"
                }`}
              >
                {qtyStatus.label}
              </span>
            </span>
            {stock.needsReview && (
              <span
                title={stock.notes ?? "Pendente de auditoria"}
                className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200"
              >
                revisar
              </span>
            )}
            {canEdit && (
              <span className="flex shrink-0 items-center gap-0.5" aria-hidden={false}>
                <button
                  title="Mover para cima"
                  aria-label={`Mover ${stock.material.code} para cima`}
                  disabled={isMoving || index === 0}
                  onClick={() => onMove(stock.id, index - 1)}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-xs text-zinc-500 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-800"
                >
                  ↑
                </button>
                <button
                  title="Mover para baixo"
                  aria-label={`Mover ${stock.material.code} para baixo`}
                  disabled={isMoving || index === node.stocks.length - 1}
                  onClick={() => onMove(stock.id, index + 1)}
                  className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-xs text-zinc-500 hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-zinc-800"
                >
                  ↓
                </button>
              </span>
            )}
            {canEdit && (
              <button
                onClick={() => handleRemoveClick(stock.id, `${stock.material.name} (${stock.material.code})`)}
                className="shrink-0 rounded-md border border-zinc-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-zinc-700 dark:hover:bg-red-950"
              >
                Remover
              </button>
            )}
            {isThisMoving && (
              <div
                role="status"
                aria-live="polite"
                className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-white/75 text-[13px] font-medium text-zinc-600 dark:bg-black/75 dark:text-zinc-300"
              >
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-sky-600" aria-hidden />
                Movendo…
              </div>
            )}
          </div>
        );
      })}

      <ConfirmDialog
        open={removeDialogOpen}
        onOpenChange={setRemoveDialogOpen}
        title="Remover item"
        description={`Tem certeza que deseja remover "${stockToRemove?.label}" desta localização?`}
        onConfirm={handleConfirmRemove}
      />
    </div>
  );
}
