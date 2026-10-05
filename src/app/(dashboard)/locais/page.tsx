"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCanEdit, useIsAdmin } from "@/hooks/use-me";
import { apiErrorMessage, safeJson } from "@/lib/api-client";
import { useZodForm } from "@/hooks/use-form";
import { locationSchema, type LocationFormData } from "@/lib/schemas";
import { findNamePath, findNode, type TreeNode } from "@/lib/warehouse";
import { buildLocationOptions } from "@/lib/location-options";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormInput, FormSelect, FormActions } from "@/components/ui/forms";
import { FormSelectOption } from "@/components/ui/forms/form-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { ArrowLeftRight, ChevronRight, CornerUpLeft, Pencil, Trash2 } from "lucide-react";

interface Location {
  id: string;
  name: string;
  parentId: string | null;
  disabled: boolean;
}

async function fetchLocations(): Promise<Location[]> {
  const response = await fetch("/api/locations");
  if (!response.ok) throw new Error("Failed to load locations");
  const body = await safeJson(response);
  return (body as { data?: Location[] })?.data ?? [];
}

async function fetchTree(): Promise<TreeNode[]> {
  const response = await fetch("/api/locations/tree");
  if (!response.ok) throw new Error("Failed to load tree");
  const body = await safeJson(response);
  return (body as { data?: TreeNode[] })?.data ?? [];
}

const EMPTY_FORM: LocationFormData = {
  name: "",
  parentId: undefined,
};

function countSubtreeStocks(node: TreeNode): number {
  return (
    node.stocks.length +
    node.children.reduce((sum, child) => sum + countSubtreeStocks(child), 0)
  );
}

export default function LocaisPage() {
  const queryClient = useQueryClient();
  const canEdit = useCanEdit();
  const isAdmin = useIsAdmin();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState<Location | null>(null);

  // Drill-down: when set, only this subtree is shown.
  const [focusId, setFocusId] = useState<string | null>(null);

  // Rename + reparent inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingParentId, setEditingParentId] = useState("");

  // Transfer dialog
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferSource, setTransferSource] = useState<TreeNode | null>(null);
  const [transferChecked, setTransferChecked] = useState<Set<string>>(new Set());
  const [transferToId, setTransferToId] = useState("");

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ["locations"],
    queryFn: fetchLocations,
  });
  const { data: tree = [] } = useQuery({
    queryKey: ["tree"],
    queryFn: fetchTree,
    enabled: canEdit || isAdmin,
  });

  const form = useZodForm<LocationFormData>(locationSchema, {
    defaultValues: EMPTY_FORM,
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ["locations"] });
    void queryClient.invalidateQueries({ queryKey: ["tree"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const createMutation = useMutation({
    mutationFn: async (data: LocationFormData) => {
      const response = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name, parentId: data.parentId }),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), "Create failed"));
    },
    onSuccess: () => {
      form.reset(EMPTY_FORM);
      invalidate();
      toast.success("Local criado com sucesso");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name, parentId }: { id: string; name: string; parentId: string | null }) => {
      const response = await fetch(`/api/locations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, parentId }),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), "Update failed"));
    },
    onSuccess: () => {
      setEditingId(null);
      invalidate();
      toast.success("Local atualizado com sucesso");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const transferMutation = useMutation({
    mutationFn: async ({
      id,
      toLocationId,
      materialIds,
    }: {
      id: string;
      toLocationId: string;
      materialIds: string[];
    }) => {
      const response = await fetch(`/api/locations/${id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toLocationId, materialIds }),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), "Transfer failed"));
      return response.json() as Promise<{
        data: { from: string; to: string; moved: { code: string; quantity: number }[] };
      }>;
    },
    onSuccess: (body) => {
      const names = body.data.moved.map((m) => `${m.code} ×${m.quantity}`).join(", ");
      setTransferOpen(false);
      setTransferSource(null);
      setTransferChecked(new Set());
      setTransferToId("");
      invalidate();
      toast.success(`Movido para ${body.data.to}: ${names}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/locations/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), "Remove failed"));
    },
    onSuccess: () => {
      if (locationToDelete && isFocusAffected(locationToDelete.id)) {
        setFocusId(null);
      }
      setDeleteDialogOpen(false);
      setLocationToDelete(null);
      invalidate();
      toast.success("Local removido com sucesso");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleSubmit(data: LocationFormData): void {
    createMutation.mutate(data);
  }

  function startEdit(location: Location): void {
    setEditingId(location.id);
    setEditingName(location.name);
    setEditingParentId(location.parentId ?? "");
  }

  function handleSaveEdit(): void {
    if (!editingId || !editingName.trim()) return;
    updateMutation.mutate({
      id: editingId,
      name: editingName.trim(),
      parentId: editingParentId || null,
    });
  }

  function handleDeleteClick(location: Location): void {
    setLocationToDelete(location);
    setDeleteDialogOpen(true);
  }

  function handleConfirmDelete(): void {
    if (locationToDelete) {
      removeMutation.mutate(locationToDelete.id);
    }
  }

  function openTransfer(node: TreeNode): void {
    setTransferSource(node);
    setTransferChecked(new Set(node.stocks.map((s) => s.material.id)));
    setTransferToId("");
    setTransferOpen(true);
  }

  function toggleTransferMaterial(materialId: string): void {
    setTransferChecked((prev) => {
      const next = new Set(prev);
      if (next.has(materialId)) next.delete(materialId);
      else next.add(materialId);
      return next;
    });
  }

  function handleConfirmTransfer(): void {
    if (!transferSource || !transferToId || transferChecked.size === 0) {
      toast.error("Escolha o destino e ao menos um material");
      return;
    }
    transferMutation.mutate({
      id: transferSource.id,
      toLocationId: transferToId,
      materialIds: [...transferChecked],
    });
  }

  const parentOptions: FormSelectOption[] = buildLocationOptions(locations);

  // Transfer destination: leaves only (no active children), never the source.
  const leafOptions: FormSelectOption[] = buildLocationOptions(locations, {
    leavesOnly: true,
    excludeId: transferSource?.id,
  });

  const roots = locations.filter((l) => !l.parentId);
  const childrenOf = (id: string) => locations.filter((l) => l.parentId === id);
  const byId = new Map(locations.map((l) => [l.id, l]));

  // Breadcrumb from the root down to the focused node.
  const focusPath: Location[] = [];
  if (focusId) {
    const guard = new Set<string>();
    let current = byId.get(focusId);
    while (current && !guard.has(current.id)) {
      guard.add(current.id);
      focusPath.unshift(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
  }
  const focusNode = focusId ? (byId.get(focusId) ?? null) : null;
  const visibleRoots = focusNode ? [focusNode] : roots;

  function isFocusAffected(deletedId: string): boolean {
    if (!focusId) return false;
    if (deletedId === focusId) return true;
    return focusPath.some((l) => l.id === deletedId);
  }

  function renderRow(location: Location, depth: number): React.ReactNode {
    const node = findNode(tree, location.id);
    const stockCount = node?.stocks.length ?? 0;
    const isEditing = editingId === location.id;
    const hasChildren = childrenOf(location.id).length > 0;

    return (
      <div key={location.id}>
        <div
          style={{ marginLeft: depth * 16 }}
          className="flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 text-sm"
        >
          {isEditing ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
              <div className="min-w-32 flex-1">
                <FormInput
                  label="Nome"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                />
              </div>
              <div className="min-w-32 flex-1">
                <FormSelect
                  label="Local pai"
                  value={editingParentId}
                  onValueChange={setEditingParentId}
                  options={buildLocationOptions(locations, { excludeSubtreeOf: location.id })}
                  placeholder="Sem pai (raiz)"
                  allowClear
                />
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button size="sm" onClick={handleSaveEdit} disabled={updateMutation.isPending || !editingName.trim()}>
                  Salvar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                  Voltar
                </Button>
              </div>
            </div>
          ) : (
            <>
              <span className="min-w-0 flex-1 basis-32 break-words">
                {location.name}
                {location.disabled && (
                  <Badge variant="secondary" className="ml-2 text-xs">desativado</Badge>
                )}
                {stockCount > 0 && (
                  <span className="ml-2 text-xs text-zinc-500">
                    {stockCount} {stockCount === 1 ? "item" : "itens"}
                  </span>
                )}
              </span>
              {canEdit && !location.disabled && (
                <span className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="sm" onClick={() => startEdit(location)} className="gap-1">
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </Button>
                  {hasChildren && (
                    <Button variant="ghost" size="sm" onClick={() => setFocusId(location.id)} className="gap-1">
                      <ChevronRight className="h-3.5 w-3.5" />
                      Entrar
                    </Button>
                  )}
                  {stockCount > 0 && node && (
                    <Button variant="ghost" size="sm" onClick={() => openTransfer(node)} className="gap-1">
                      <ArrowLeftRight className="h-3.5 w-3.5" />
                      Mover itens
                    </Button>
                  )}
                </span>
              )}
              {isAdmin && !location.disabled && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteClick(location)}
                  className="shrink-0 gap-1 text-red-600 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir
                </Button>
              )}
            </>
          )}
        </div>
        <div>
          {childrenOf(location.id).map((child) => renderRow(child, depth + 1))}
        </div>
      </div>
    );
  }

  const deleteNode = locationToDelete ? findNode(tree, locationToDelete.id) : null;
  const deleteOwn = deleteNode?.stocks.length ?? 0;
  const deleteSub = deleteNode ? countSubtreeStocks(deleteNode) - deleteOwn : 0;

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Locais</h2>

      {canEdit && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Criar Local</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormInput
                  {...form.register("name")}
                  label="Nome do Local"
                  placeholder="Ex.: Corredor A, Prateleira 1, Nível 2"
                  error={form.formState.errors.name?.message}
                />
                <FormSelect
                  value={form.watch("parentId") || ""}
                  onValueChange={(value) => form.setValue("parentId", value || undefined, { shouldValidate: true })}
                  label="Local Pai"
                  options={parentOptions}
                  placeholder="Sem pai (raiz)"
                  allowClear
                />
              </div>
              <FormActions
                onSubmit={() => form.handleSubmit(handleSubmit)()}
                submitLabel="Criar local"
                isSubmitting={createMutation.isPending}
              />
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-4">
            {focusNode && (
              <div className="mb-2 flex min-h-[44px] flex-wrap items-center gap-1 text-sm">
                <Button variant="ghost" size="sm" onClick={() => setFocusId(null)} className="gap-1">
                  <CornerUpLeft className="h-3.5 w-3.5" />
                  Todas
                </Button>
                {focusPath.map((l) => (
                  <span key={l.id} className="flex items-center gap-1">
                    <span className="text-zinc-400">›</span>
                    <button
                      onClick={() => setFocusId(l.id)}
                      className={`rounded px-1 py-1 hover:underline ${
                        l.id === focusId ? "font-semibold" : "text-zinc-600 dark:text-zinc-300"
                      }`}
                    >
                      {l.name}
                    </button>
                  </span>
                ))}
              </div>
            )}
            {visibleRoots.map((root) => renderRow(root, 0))}
            {visibleRoots.length === 0 && (
              <p className="px-2 py-2 text-sm text-muted-foreground">Nenhum local cadastrado.</p>
            )}
          </CardContent>
        </Card>
      )}

      {transferOpen && transferSource && (
        <Card className="mt-4 border-sky-300 dark:border-sky-800">
          <CardHeader>
            <CardTitle className="text-sm">
              Mover itens de {(findNamePath(tree, transferSource.id) ?? [transferSource.name]).join(" → ")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              {transferSource.stocks.map((s) => (
                <label key={s.material.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={transferChecked.has(s.material.id)}
                    onChange={() => toggleTransferMaterial(s.material.id)}
                    className="h-4 w-4 accent-sky-600"
                  />
                  <span className="font-mono font-semibold">{s.material.code}</span>
                  <span className="min-w-0 flex-1 truncate">{s.material.name}</span>
                  <span className="text-xs text-zinc-500">×{s.quantity}</span>
                </label>
              ))}
            </div>
            <FormSelect
              label="Destino (somente níveis folha)"
              value={transferToId}
              onValueChange={setTransferToId}
              options={leafOptions}
              placeholder="Selecione o destino..."
            />
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleConfirmTransfer}
                disabled={transferMutation.isPending || !transferToId || transferChecked.size === 0}
              >
                {transferMutation.isPending ? "Movendo…" : "Mover selecionados"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setTransferOpen(false);
                  setTransferSource(null);
                }}
              >
                Voltar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Excluir local"
        description={
          deleteOwn + deleteSub > 0
            ? `"${locationToDelete?.name}" tem ${deleteOwn} ite(ns) aqui e ${deleteSub} na subárvore. Transfira primeiro (botão Mover itens) — a exclusão é barrada com saldo.`
            : `Tem certeza que deseja excluir "${locationToDelete?.name}"? Esta ação não pode ser desfeita.`
        }
        onConfirm={handleConfirmDelete}
        confirmLabel="Excluir"
        isLoading={removeMutation.isPending}
      />
    </div>
  );
}
