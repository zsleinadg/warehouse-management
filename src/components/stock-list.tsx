"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { safeJson } from "@/lib/api-client";
import type { TreeNode } from "@/lib/warehouse";

interface CatalogMaterial {
  id: string;
  code: string;
  name: string;
  unit: string;
  disabled: boolean;
}

async function fetchCatalog(): Promise<CatalogMaterial[]> {
  const response = await fetch("/api/materials");
  if (!response.ok) return [];
  const body = await safeJson(response);
  const data = (body as { data?: CatalogMaterial[] })?.data ?? [];
  return data.filter((m) => !m.disabled);
}

export interface PlacePrefill {
  code: string;
  name: string;
  nonce: number;
}

interface StockListProps {
  node: TreeNode | null;
  breadcrumb: string[];
  highlightCode: string | null;
  canEdit: boolean;
  onMove: (stockId: string, targetIndex: number) => void;
  onAdd: (code: string, name: string) => void;
  onRemove: (stockId: string, label: string) => void;
  formError: string | null;
  placePrefill?: PlacePrefill | null;
  isSaving?: boolean;
  isMoving?: boolean;
  movingId?: string | null;
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
  placePrefill = null,
  isSaving = false,
  isMoving = false,
  movingId = null,
}: StockListProps) {
  const highlightRef = useRef<HTMLDivElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  // O prefill vindo da busca ("sem estoque — clique para alocar") chega via
  // `key` (remount) pela página: estes estados iniciais valem por montagem.
  const [showForm, setShowForm] = useState(placePrefill !== null);
  const [code, setCode] = useState(placePrefill?.code ?? "");
  const [name, setName] = useState(placePrefill?.name ?? "");
  const [isNew, setIsNew] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");

  const { data: catalog = [] } = useQuery({
    queryKey: ["materials"],
    queryFn: fetchCatalog,
    enabled: canEdit,
    staleTime: 60_000,
  });

  const linkedCodes = useMemo(
    () => new Set((node?.stocks ?? []).map((s) => s.material.code.toUpperCase())),
    [node],
  );

  const filteredCatalog = useMemo(() => {
    const q = catalogSearch.trim().toLowerCase();
    if (!q) return catalog.slice(0, 100);
    return catalog
      .filter(
        (m) =>
          m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q),
      )
      .slice(0, 100);
  }, [catalog, catalogSearch]);

  // Confirm dialog state
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [stockToRemove, setStockToRemove] = useState<{ id: string; label: string } | null>(null);

  useEffect(() => {
    if (highlightCode && highlightRef.current) {
      highlightRef.current.scrollIntoView({ block: "center" });
    }
  }, [highlightCode, node?.id]);

  if (!node) {
    return (
      <div className="px-5 py-5 text-center">
        <p className="text-[13px] text-zinc-500">
          Selecione uma localização na árvore à esquerda para ver e vincular os materiais dela.
        </p>
        {canEdit && placePrefill && (
          <p className="mt-2 text-[13px] text-sky-800 dark:text-sky-300">
            Material <span className="font-mono font-semibold">{placePrefill.code}</span> pronto para
            vincular — é só escolher o local destino.
          </p>
        )}
        {!canEdit && (
          <p className="mt-2 text-[13px] text-zinc-500">
            Busque um item acima para localizar onde ele está.
          </p>
        )}
      </div>
    );
  }

  const duplicateCode = code.trim() ? linkedCodes.has(code.trim().toUpperCase()) : false;

  function resetForm(): void {
    setCode("");
    setName("");
    setIsNew(false);
    setCatalogSearch("");
    setShowForm(false);
  }

  function pickFromCatalog(materialCode: string): void {
    const found = catalog.find((m) => m.code === materialCode);
    if (!found) return;
    setCode(found.code);
    setName(found.name);
    setIsNew(false);
  }

  function submitAdd(event: React.FormEvent): void {
    event.preventDefault();
    const trimmedCode = code.trim();
    const trimmedName = name.trim();
    if (!trimmedCode || !trimmedName || duplicateCode || isSaving) return;
    onAdd(trimmedCode, trimmedName);
    resetForm();
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
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-xs text-zinc-500">{breadcrumb.join(" → ")}</p>
        {canEdit && (
          <button
            onClick={() => setShowForm((open) => !open)}
            className="shrink-0 rounded-lg border border-sky-400 bg-sky-100 px-3 py-1.5 text-[13px] font-semibold text-sky-800 hover:brightness-105 dark:bg-sky-950 dark:text-sky-300"
          >
            + Vincular material
          </button>
        )}
      </div>

      {canEdit && showForm && (
        <form
          onSubmit={submitAdd}
          className="mb-2.5 space-y-2 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-2.5 dark:border-zinc-700 dark:bg-black"
        >
          <p className="text-[12px] text-zinc-500">
            Vinculando em: <span className="font-semibold">{breadcrumb.join(" → ")}</span>
            <span className="block text-[11px]">
              Cria a plaquinha do local com 0 unidades. O saldo entra via Entradas (NF).
            </span>
          </p>
          {!isNew && (
            <>
              <input
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Buscar material no catálogo por código ou nome…"
                className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
              />
              <select
                value={catalog.some((m) => m.code === code) ? code : ""}
                onChange={(e) => pickFromCatalog(e.target.value)}
                className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-[13px] outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <option value="">Selecione um material do catálogo…</option>
                {filteredCatalog.map((m) => (
                  <option key={m.id} value={m.code}>
                    {m.code} — {m.name}
                    {linkedCodes.has(m.code.toUpperCase()) ? " (já vinculado)" : ""}
                  </option>
                ))}
              </select>
              {code.trim() && name.trim() && (
                <p className="text-[12px] text-zinc-600 dark:text-zinc-400">
                  Selecionado: <span className="font-mono font-semibold">{code}</span> — {name}
                </p>
              )}
            </>
          )}
          {isNew && (
            <div className="flex flex-wrap gap-2">
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
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={!code.trim() || !name.trim() || duplicateCode || isSaving}
              className="rounded-lg border border-sky-400 bg-sky-100 px-3 py-1.5 text-[13px] font-semibold text-sky-800 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-sky-950 dark:text-sky-300"
            >
              {isSaving ? "Vinculando…" : "Vincular ao local"}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsNew((v) => !v);
                setCode("");
                setName("");
                setCatalogSearch("");
              }}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-[13px] text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {isNew ? "Escolher do catálogo" : "Novo material"}
            </button>
            {duplicateCode && (
              <p className="w-full text-xs text-amber-700 dark:text-amber-300">
                Este material já está vinculado a este local.
              </p>
            )}
          </div>
          {formError && <p className="w-full text-xs text-red-600">{formError}</p>}
        </form>
      )}

      {canEdit && (
        <p className="mb-2 text-[11px] text-zinc-500">
          Arraste pelo ⋮⋮ ou use as setas ↑ ↓ para reordenar (no celular, use as setas).
        </p>
      )}

      {node.stocks.length === 0 && (
        <div className="px-5 py-5 text-center">
          <p className="text-[13px] text-zinc-500">
            Nenhum material vinculado a este local ainda.
          </p>
          {canEdit && !showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-2 rounded-lg border border-sky-400 bg-sky-100 px-3 py-1.5 text-[13px] font-semibold text-sky-800 hover:brightness-105 dark:bg-sky-950 dark:text-sky-300"
            >
              Vincular primeiro material
            </button>
          )}
        </div>
      )}

      {node.stocks.map((stock, index) => {
        const highlighted = highlightCode === stock.material.code;
        const isThisMoving = movingId !== null && movingId === stock.id;
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
              // onDrop dispara no ALVO: move o item arrastado (dragId),
              // não o alvo — passar stock.id aqui era no-op. Ignora drops
              // com reorder em voo para não encavalar transações (P2034).
              if (isMoving || dragId === null || dragId === stock.id) return;
              onMove(dragId, index);
              setDragIndex(null);
              setDragId(null);
            }}
            className={`relative mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-lg border bg-zinc-50 px-2.5 py-2.5 dark:bg-black ${
              highlighted ? "animate-pulse border-sky-400" : "border-zinc-200 dark:border-zinc-700"
            } ${canEdit ? "cursor-grab" : ""} ${dragIndex === index ? "opacity-40" : ""}`}
          >
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
            {stock.quantity === 0 ? (
              <span
                title="Local demarcado (plaquinha), sem saldo. O saldo entra via Entradas (NF)."
                className="shrink-0 text-xs text-zinc-400"
              >
                0 un · só plaquinha
              </span>
            ) : (
              <span className="shrink-0 text-xs text-zinc-500">×{stock.quantity}</span>
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