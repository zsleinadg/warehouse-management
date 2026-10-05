"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCanEdit } from "@/hooks/use-me";
import { apiErrorMessage, formatCents, safeJson } from "@/lib/api-client";
import { useZodForm } from "@/hooks/use-form";
import { materialSchema, type MaterialFormData } from "@/lib/schemas";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormInput, FormMoneyInput, FormSelect, FormActions } from "@/components/ui/forms";
import { toast } from "sonner";
import { Edit2, Trash2 } from "lucide-react";

interface Material {
  id: string;
  code: string;
  name: string;
  unit: string;
  minStock: number;
  costCents: number;
  disabled: boolean;
}

async function fetchMaterials(): Promise<Material[]> {
  const response = await fetch("/api/materials");
  if (!response.ok) throw new Error("Failed to load materials");
  const body = await safeJson(response);
  return (body as { data?: Material[] })?.data ?? [];
}

const UNIT_OPTIONS = [
  { value: "UN", label: "UN - Unidade" },
  { value: "M", label: "M - Metro" },
  { value: "KG", label: "KG - Quilograma" },
  { value: "L", label: "L - Litro" },
  { value: "CX", label: "CX - Caixa" },
  { value: "PC", label: "PC - Peça" },
];

const EMPTY_FORM: MaterialFormData = {
  code: "",
  name: "",
  unit: "UN",
  minStock: 0,
  costCents: 0,
};

export default function MateriaisPage() {
  const queryClient = useQueryClient();
  const canEdit = useCanEdit();
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ["materials"],
    queryFn: fetchMaterials,
  });

  const form = useZodForm<MaterialFormData>(materialSchema, {
    defaultValues: EMPTY_FORM,
  });

  const watchedUnit = form.watch("unit");

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ["materials"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const saveMutation = useMutation({
    mutationFn: async (data: MaterialFormData) => {
      const url = editingId ? `/api/materials/${editingId}` : "/api/materials";
      const response = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), "Save failed"));
    },
    onSuccess: () => {
      form.reset(EMPTY_FORM);
      setEditingId(null);
      invalidate();
      toast.success(editingId ? "Material atualizado com sucesso" : "Material cadastrado com sucesso");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async (material: Material) => {
      const response = await fetch(`/api/materials/${material.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: !material.disabled }),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), "Update failed"));
    },
    onSuccess: () => {
      invalidate();
      toast.success("Status do material alterado com sucesso");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function startEdit(material: Material): void {
    setEditingId(material.id);
    form.reset({
      code: material.code,
      name: material.name,
      unit: material.unit,
      minStock: material.minStock,
      costCents: material.costCents,
    });
  }

  function handleSubmit(data: MaterialFormData): void {
    saveMutation.mutate(data);
  }

  function handleCancel(): void {
    setEditingId(null);
    form.reset(EMPTY_FORM);
  }

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Materiais</h2>

      {canEdit && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>{editingId ? "Editar Material" : "Cadastrar Material"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <FormInput
                  {...form.register("code")}
                  label="Código"
                  placeholder="Código único"
                  disabled={editingId !== null}
                  error={form.formState.errors.code?.message}
                />
                <FormInput
                  {...form.register("name")}
                  label="Nome"
                  placeholder="Nome do material"
                  error={form.formState.errors.name?.message}
                />
                <FormSelect
                  value={watchedUnit}
                  onValueChange={(value) => form.setValue("unit", value, { shouldValidate: true })}
                  label="Unidade"
                  options={UNIT_OPTIONS}
                  placeholder="Selecione a unidade"
                  error={form.formState.errors.unit?.message}
                />
                <FormInput
                  {...form.register("minStock", { valueAsNumber: true })}
                  label="Estoque Mínimo"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0"
                  min={0}
                  error={form.formState.errors.minStock?.message}
                />
                <FormMoneyInput
                  label="Custo (R$)"
                  valueCents={form.watch("costCents") ?? 0}
                  onChangeCents={(cents) => form.setValue("costCents", cents, { shouldValidate: true })}
                  error={form.formState.errors.costCents?.message}
                />
              </div>
              <FormActions
                onSubmit={() => form.handleSubmit(handleSubmit)()}
                onCancel={handleCancel}
                submitLabel={editingId ? "Atualizar" : "Cadastrar"}
                isSubmitting={saveMutation.isPending}
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
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-muted/50 bg-muted/50">
                    <th className="text-left p-3 font-medium">Código</th>
                    <th className="text-left p-3 font-medium">Nome</th>
                    <th className="text-left p-3 font-medium">Un</th>
                    <th className="text-left p-3 font-medium">Mín</th>
                    <th className="text-left p-3 font-medium">Custo</th>
                    <th className="text-left p-3 font-medium">Status</th>
                    {canEdit && <th className="text-left p-3 font-medium">Ações</th>}
                  </tr>
                </thead>
                <tbody>
                  {materials.map((m) => (
                    <tr key={m.id} className="border-b border-muted/50 hover:bg-muted/50">
                      <td className="p-3 font-mono font-semibold text-primary">{m.code}</td>
                      <td className="p-3">{m.name}</td>
                      <td className="p-3">{m.unit}</td>
                      <td className="p-3">{m.minStock}</td>
                      <td className="p-3">{formatCents(m.costCents)}</td>
                      <td className="p-3">
                        {m.disabled ? (
                          <Badge variant="secondary">inativo</Badge>
                        ) : (
                          <Badge variant="success">ativo</Badge>
                        )}
                      </td>
                      {canEdit && (
                        <td className="p-3">
                          <div className="flex gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEdit(m)}
                              className="gap-1.5"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleMutation.mutate(m)}
                              className="gap-1.5 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              {m.disabled ? "Ativar" : "Desativar"}
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {materials.length === 0 && (
                <div className="p-6 text-center text-muted-foreground">
                  Nenhum material cadastrado.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}