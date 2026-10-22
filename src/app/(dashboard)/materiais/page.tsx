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
import { Edit2, Trash2, Search, Download, RefreshCw } from "lucide-react";

interface Material {
  id: string;
  code: string;
  name: string;
  unit: string;
  minStock: number;
  costCents: number;
  disabled: boolean;
}

interface CatalogMaterial {
  id: string;
  code: string;
  name: string;
  unit: string;
  plant: string;
  storageLocation: string;
}

async function fetchMaterials(): Promise<Material[]> {
  const response = await fetch("/api/materials");
  if (!response.ok) throw new Error("Failed to load materials");
  const body = await safeJson(response);
  return (body as { data?: Material[] })?.data ?? [];
}

async function fetchCatalogSearch(q: string): Promise<CatalogMaterial[]> {
  if (!q.trim()) return [];
  const response = await fetch(`/api/catalog?q=${encodeURIComponent(q)}&take=20`);
  if (!response.ok) throw new Error("Failed to search catalog");
  const body = await safeJson(response);
  return (body as { data?: CatalogMaterial[] })?.data ?? [];
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
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogResults, setCatalogResults] = useState<CatalogMaterial[]>([]);
  const [searchingCatalog, setSearchingCatalog] = useState(false);
  const [showCatalogModal, setShowCatalogModal] = useState(false);

  const { data: materials = [], isLoading } = useQuery({
    queryKey: ["materials"],
    queryFn: fetchMaterials,
  });

  const form = useZodForm<MaterialFormData>(materialSchema, {
    defaultValues: EMPTY_FORM,
  });

  const watchedUnit = form.watch("unit");
  const watchedCode = form.watch("code");

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

  async function searchCatalog(q: string) {
    if (!q.trim()) {
      setCatalogResults([]);
      return;
    }
    setSearchingCatalog(true);
    try {
      const results = await fetchCatalogSearch(q);
      setCatalogResults(results);
    } catch (err) {
      console.error("Erro ao buscar catálogo:", err);
      setCatalogResults([]);
    } finally {
      setSearchingCatalog(false);
    }
  }

  function fillFromCatalog(cat: CatalogMaterial) {
    form.setValue("code", cat.code);
    form.setValue("name", cat.name);
    form.setValue("unit", cat.unit);
    setCatalogSearch("");
    setCatalogResults([]);
  }

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

  function handleCodeChange(value: string) {
    form.setValue("code", value, { shouldValidate: true });
    if (value.length >= 3) {
      searchCatalog(value);
    } else {
      setCatalogResults([]);
    }
  }

  function openCatalogModal() {
    setShowCatalogModal(true);
    setCatalogSearch("");
    setCatalogResults([]);
  }

  function importMultipleFromCatalog(selected: CatalogMaterial[]) {
    // Para importar múltiplos, criamos um por um via API
    selected.forEach(async (cat, i) => {
      try {
        const response = await fetch("/api/materials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: cat.code,
            name: cat.name,
            unit: cat.unit,
            minStock: 0,
            costCents: 0,
          }),
        });
        if (!response.ok) {
          const err = await response.json();
          console.error(`Erro ao importar ${cat.code}:`, err);
        }
      } catch (e) {
        console.error(`Erro ao importar ${cat.code}:`, e);
      }
      // Pequeno delay para não sobrecarregar
      await new Promise(r => setTimeout(r, 100 * i));
    });
    setShowCatalogModal(false);
    invalidate();
    toast.success(`${selected.length} material(is) importado(s) do catálogo`);
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
                <div className="relative">
                  <FormInput
                    {...form.register("code")}
                    label="Código"
                    placeholder="Digite código para buscar no catálogo..."
                    disabled={editingId !== null}
                    error={form.formState.errors.code?.message}
                    onChange={(e) => handleCodeChange(e.target.value)}
                  />
                  {catalogResults.length > 0 && !editingId && (
                    <div className="absolute z-10 w-full mt-1 max-h-60 overflow-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg">
                      {catalogResults.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => fillFromCatalog(cat)}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 border-b last:border-0"
                        >
                          <div className="font-mono font-medium text-primary">{cat.code}</div>
                          <div className="text-xs text-gray-600 dark:text-gray-300">{cat.name} ({cat.unit})</div>
                          <div className="text-[10px] text-gray-400">Planta: {cat.plant} | Local: {cat.storageLocation}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <FormInput
                  {...form.register("name")}
                  label="Nome"
                  placeholder="Nome do material (preenchido automaticamente do catálogo)"
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
              <div className="flex gap-2">
                <FormActions
                  onSubmit={() => form.handleSubmit(handleSubmit)()}
                  onCancel={handleCancel}
                  submitLabel={editingId ? "Atualizar" : "Cadastrar"}
                  isSubmitting={saveMutation.isPending}
                />
                {!editingId && (
                  <Button type="button" variant="outline" onClick={openCatalogModal} className="mt-6 self-end">
                    <Download className="h-4 w-4 mr-1.5" />
                    Importar do Catálogo
                  </Button>
                )}
              </div>
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

      {/* Modal Importar do Catálogo */}
      {showCatalogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl max-h-[80vh] bg-white dark:bg-gray-900 rounded-lg shadow-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
              <h3 className="text-lg font-semibold">Importar Materiais do Catálogo</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowCatalogModal(false)}>
                <RefreshCw className="h-5 w-5" />
              </Button>
            </div>
            <div className="p-4 border-b dark:border-gray-700">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch((e.target as HTMLInputElement).value)}
                  placeholder="Buscar por código, nome... (mín. 2 caracteres)"
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-sm"
                  onKeyDown={(e) => {
                    const input = e.target as HTMLInputElement;
                    if (e.key === "Enter" && input.value.length >= 2) searchCatalog(input.value);
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">Digite 2+ caracteres para buscar. Resultados limitados a 50.</p>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {searchingCatalog && (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              )}
              {!searchingCatalog && catalogResults.length === 0 && catalogSearch.length >= 2 && (
                <p className="text-center text-gray-500 py-8">Nenhum resultado encontrado</p>
              )}
              {!searchingCatalog && catalogResults.length > 0 && (
                <div className="space-y-2 max-h-96 overflow-auto">
                  {catalogResults.map((cat) => (
                    <label
                      key={cat.id}
                      className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        value={cat.id}
                        onChange={(e) => {
                          const selected = catalogResults.filter(c => c.id === cat.id);
                          // We'll handle selection via a separate state
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-mono font-medium text-primary truncate">{cat.code}</div>
                        <div className="text-sm text-gray-700 dark:text-gray-300 truncate">{cat.name}</div>
                        <div className="text-xs text-gray-500">Un: {cat.unit} | Planta: {cat.plant} | Local: {cat.storageLocation}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t dark:border-gray-700">
              <Button variant="outline" onClick={() => setShowCatalogModal(false)}>Cancelar</Button>
              <Button
                onClick={() => {
                  // Get selected checkboxes
                  const checkboxes = document.querySelectorAll<HTMLInputElement>('#catalog-modal input[type="checkbox"]:checked');
                  const selectedIds = Array.from(checkboxes).map(cb => cb.value);
                  const selected = catalogResults.filter(c => selectedIds.includes(c.id));
                  if (selected.length === 0) {
                    toast.error("Selecione pelo menos um material");
                    return;
                  }
                  importMultipleFromCatalog(selected);
                }}
              >
                Importar Selecionados ({catalogResults.filter(c => 
                  document.querySelector<HTMLInputElement>(`#catalog-modal input[value="${c.id}"]`)?.checked
                ).length})
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}