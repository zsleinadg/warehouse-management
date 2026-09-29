"use client";

import { useEffect, useRef } from "react";
import type { TreeNode } from "@/lib/warehouse";

interface StockListProps {
  node: TreeNode | null;
  breadcrumb: string[];
  highlightCode: string | null;
}

export default function StockList({ node, breadcrumb, highlightCode }: StockListProps) {
  const highlightRef = useRef<HTMLDivElement>(null);

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

  return (
    <div>
      <p className="mb-2 text-xs text-zinc-500">{breadcrumb.join(" → ")}</p>
      {node.stocks.length === 0 && (
        <p className="px-5 py-5 text-center text-[13px] text-zinc-500">
          Nenhum item nesta localização ainda.
        </p>
      )}
      {node.stocks.map((stock) => {
        const highlighted = highlightCode === stock.material.code;
        return (
          <div
            key={stock.id}
            ref={highlighted ? highlightRef : undefined}
            title={stock.notes ?? undefined}
            className={`mb-1.5 flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-2.5 dark:border-zinc-700 dark:bg-black ${
              highlighted ? "animate-pulse border-sky-400" : ""
            }`}
          >
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
          </div>
        );
      })}
    </div>
  );
}
