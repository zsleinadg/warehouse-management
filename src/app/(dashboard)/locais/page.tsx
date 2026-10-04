"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCanEdit, useIsAdmin } from "@/hooks/use-me";
import { apiErrorMessage, safeJson } from "@/lib/api-client";
import { useZodForm } from "@/hooks/use-form";
import { locationSchema, type LocationFormData } from "@/lib/schemas";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormInput, FormSelect, FormActions } from "@/components/ui/forms";
import { FormSelectOption } from "@/components/ui/forms/form-select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

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

const EMPTY_FORM: LocationFormData = {
  name: "",
  parentId: undefined,
};

export default function LocaisPage() {
  const queryClient = useQueryClient();
  const canEdit = useCanEdit();
  const isAdmin = useIsAdmin();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [locationToDelete, setLocationToDelete] = useState<Location | null>(null);

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ["locations"],
    queryFn: fetchLocations,
  });

  const form = useZodForm<LocationFormData>(locationSchema, {
    defaultValues: EMPTY_FORM,
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ["locations"] });
    void queryClient.invalidateQueries({ queryKey: ["tree"] });
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

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/locations/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), "Remove failed"));
    },
    onSuccess: () => {
      invalidate();
      toast.success("Local removido com sucesso");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleSubmit(data: LocationFormData): void {
    createMutation.mutate(data);
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

  const parentOptions: FormSelectOption[] = locations
      .filter((l) => !l.disabled)
      .map((l) => ({ value: l.id, label: l.name }));

  const roots = locations.filter((l) => !l.parentId);
  const childrenOf = (id: string) => locations.filter((l) => l.parentId === id);

  function renderRow(location: Location, depth: number): React.ReactNode {
    return (
      <div key={location.id}>
        <div
          style={{ marginLeft: depth * 16 }}
          className="flex flex-wrap items-center gap-2 rounded-md px-2 py-1.5 text-sm"
        >
          <span className="min-w-0 flex-1 basis-32 break-words">
            {location.name}
            {location.disabled && (
              <Badge variant="secondary" className="ml-2 text-xs">desativado</Badge>
            )}
          </span>
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
        </div>
        <div>
          {childrenOf(location.id).map((child) => renderRow(child, depth + 1))}
        </div>
      </div>
    );
  }

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
            {roots.map((root) => renderRow(root, 0))}
            {roots.length === 0 && (
              <p className="px-2 py-2 text-sm text-muted-foreground">Nenhum local cadastrado.</p>
            )}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Excluir local"
        description={`Tem certeza que deseja excluir "${locationToDelete?.name}"? Esta ação não pode ser desfeita.`}
        onConfirm={handleConfirmDelete}
        confirmLabel="Excluir"
        isLoading={removeMutation.isPending}
      />
    </div>
  );
}