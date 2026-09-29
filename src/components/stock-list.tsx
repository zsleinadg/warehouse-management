"use client";

import { useEffect, useRef, useState } from "react";
import type { TreeNode } from "@/lib/warehouse";

interface StockListProps {
  node: TreeNode | null;
  breadcrumb: string[];
  highlightCode: string | null;
  canEdit: boolean;
  onMove: (stockId: string, targetIndex: number) => void;
  onAdd: (code: string, name: string) => void;
  onRemove: (stockId: string, label: string) => void;
  formError: string | null;
}

export default function StockList({
  node,
  breadcrumb,
  highlightCode,
  canEdit,
  onMove,
  onAdd,
  onRemove,
  formError,
}: StockListProps) {
  const highlightRef = useRef<HTMLDivElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (highlightCode && highlightRef.current) {
      highlightRef.current.scrollIntoView({ block: "center" });
    }
  }, [highlightCode, node?.id]);

  if (!node) {
    return (
      <p className="px-5 py-5 text-center text-[13px] text-zinc-500">
        Selecione uma localização na árvore ou busque um item.
      </p>
    );
  }

  function submitAdd(event: React.FormEvent): void {
    event.preventDefault();
    if (!code.trim() || !name.trim()) return;
    onAdd(code.trim(), name.trim());
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">{breadcrumb.join(" → ")}</p>
        {canEdit && (
          <button
            onClick={() => setShowForm((open) => !open)}
            className="rounded-lg border border-sky-400 bg-sky-100 px-3 py-1.5 text-[13px] font-semibold text-sky-800 hover:brightness-105 dark:bg-sky-950 dark:text-sky-300"
          >
            + Adicionar item
          </button>
        )}
      </div>

      {canEdit && showForm && (
        <form
          onSubmit={submitAdd}
          className="mb-2.5 flex flex-wrap gap-2 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-2.5 dark:border-zinc-700 dark:bg-black"
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Código"
            className="min-w-30 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do item"
            className="min-w-30 flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
          />
          <button
            type="submit"
            className="rounded-lg border border-sky-400 bg-sky-100 px-3 py-1.5 text-[13px] font-semibold text-sky-800 hover:brightness-105 dark:bg-sky-950 dark:text-sky-300"
          >
            Salvar
          </button>
          {formError && <p className="w-full text-xs text-red-600">{formError}</p>}
        </form>
      )}

      {canEdit && (
        <p className="mb-2 text-[11px] text-zinc-500">
          Arraste os itens pelo ícone ⋮⋮ para reordenar.
        </p>
      )}

      {node.stocks.length === 0 && (
        <p className="px-5 py-5 text-center text-[13px] text-zinc-500">
          Nenhum item nesta localização ainda.
        </p>
      )}

      {node.stocks.map((stock, index) => {
        const highlighted = highlightCode === stock.material.code;
        return (
          <div
            key={stock.id}
            ref={highlighted ? highlightRef : undefined}
            title={stock.notes ?? undefined}
            draggable={canEdit}
            onDragStart={() => setDragIndex(index)}
            onDragEnd={() => setDragIndex(null)}
            onDragOver={(e) => {
              if (canEdit) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex === null || dragIndex === index) return;
              onMove(stock.id, index);
              setDragIndex(null);
            }}
            className={`mb-1.5 flex items-center gap-2.5 rounded-lg border bg-zinc-50 px-2.5 py-2.5 dark:bg-black ${
              highlighted ? "animate-pulse border-sky-400" : "border-zinc-200 dark:border-zinc-700"
            } ${canEdit ? "cursor-grab" : ""} ${dragIndex === index ? "opacity-40" : ""}`}
          >
            {canEdit && (
              <span className="text-sm text-zinc-500 select-none" aria-hidden>
                ⋮⋮
              </span>
            )}
            <span className="min-w-20 text-[13px] font-semibold text-sky-800 dark:text-sky-300">
              {stock.material.code}
            </span>
            <span className="flex-1 text-[13px]">{stock.material.name}</span>
            {stock.quantity > 1 && (
              <span className="text-xs text-zinc-500">×{stock.quantity}</span>
            )}
            {stock.needsReview && (
              <span
                title={stock.notes ?? "Pendente de auditoria"}
                className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200"
              >
                revisar
              </span>
            )}
            {canEdit && (
              <button
                onClick={() =>
                  onRemove(stock.id, `${stock.material.name} (${stock.material.code})`)
                }
                className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-zinc-700 dark:hover:bg-red-950"
              >
                Remover
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
