"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCanEdit } from "@/hooks/use-me";
import { apiErrorMessage, formatCents, safeJson } from "@/lib/api-client";
import { useZodForm } from "@/hooks/use-form";
import { purchaseInvoiceSchema, type PurchaseInvoiceFormData } from "@/lib/schemas";
import { buildLocationOptions } from "@/lib/location-options";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormInput, FormDate, FormActions, LineItemArray, FormSelectOption } from "@/components/ui/forms";
import { toast } from "sonner";
import { FileText } from "lucide-react";

interface CatalogMaterial {
  id: string;
  code: string;
  name: string;
  unit: string;
  disabled: boolean;
}

interface LocationOption {
  id: string;
  name: string;
  parentId: string | null;
  disabled: boolean;
}

interface InvoiceSummary {
  id: string;
  number: string;
  supplier: string;
  issuedAt: string;
  linesCount: number;
  totalQuantity: number;
  totalCostCents: number;
}

interface InvoiceDetail {
  id: string;
  number: string;
  supplier: string;
  issuedAt: string;
  totalCostCents: number;
  lines: {
    id: string;
    quantity: number;
    unitCostCents: number;
    material: { id: string; code: string; name: string; unit: string };
  }[];
}

async function fetchInvoices(): Promise<InvoiceSummary[]> {
  const response = await fetch("/api/purchase-invoices");
  if (!response.ok) throw new Error("Failed to load invoices");
  const body = await safeJson(response);
  return (body as { data?: InvoiceSummary[] })?.data ?? [];
}

async function fetchCatalog(): Promise<CatalogMaterial[]> {
  const response = await fetch("/api/materials");
  if (!response.ok) throw new Error("Failed to load catalog");
  const body = await safeJson(response);
  return ((body as { data?: CatalogMaterial[] })?.data ?? []).filter((m: CatalogMaterial) => !m.disabled);
}

async function fetchLocationOptions(): Promise<LocationOption[]> {
  const response = await fetch("/api/locations");
  if (!response.ok) throw new Error("Failed to load locations");
  const body = await safeJson(response);
  return ((body as { data?: LocationOption[] })?.data ?? []).filter((l: LocationOption) => !l.disabled);
}

const EMPTY_LINE = { materialId: "", locationId: "", quantity: 1, unitCostCents: 0 };

export default function EntradasPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
      <EntradasContent />
    </Suspense>
  );
}

function EntradasContent() {
  const queryClient = useQueryClient();
  const canEdit = useCanEdit();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: invoices = [] } = useQuery({ queryKey: ["invoices"], queryFn: fetchInvoices });

  // Deep-link do dashboard (?nf=NUMERO): seleciona a NF ao chegar.
  const searchNf = useSearchParams().get("nf");
  const [appliedSearchNf, setAppliedSearchNf] = useState<string | null>(null);
  if (searchNf !== appliedSearchNf) {
    setAppliedSearchNf(searchNf);
    if (searchNf) {
      const match = invoices.find((inv) => inv.number === searchNf);
      if (match) setSelectedId(match.id);
    }
  }
  const { data: catalog = [] } = useQuery({ queryKey: ["materials"], queryFn: fetchCatalog });
  const { data: locations = [] } = useQuery({
    queryKey: ["locations"],
    queryFn: fetchLocationOptions,
  });
  const { data: detail, error: detailError, isFetching: isFetchingDetail, refetch: refetchDetail } = useQuery({
    queryKey: ["invoice", selectedId],
    queryFn: async (): Promise<InvoiceDetail | null> => {
      if (!selectedId) return null;
      const response = await fetch(`/api/purchase-invoices/${selectedId}`);
      if (!response.ok) {
        const body = await safeJson(response).catch(() => null);
        throw new Error(apiErrorMessage(body, `Falha ao carregar a NF (HTTP ${response.status})`));
      }
      const body = await safeJson(response);
      return (body as { data?: InvoiceDetail })?.data ?? null;
    },
    enabled: selectedId !== null,
    retry: 1,
  });

  const form = useZodForm<PurchaseInvoiceFormData>(purchaseInvoiceSchema, {
    defaultValues: {
      number: "",
      supplier: "",
      issuedAt: new Date().toISOString().slice(0, 10),
      lines: [EMPTY_LINE],
    },
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ["invoices"] });
    void queryClient.invalidateQueries({ queryKey: ["tree"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const createMutation = useMutation({
    mutationFn: async (data: PurchaseInvoiceFormData) => {
      const response = await fetch("/api/purchase-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), "Create failed"));
      return response.json();
    },
    onSuccess: (body) => {
      form.reset({
        number: "",
        supplier: "",
        issuedAt: new Date().toISOString().slice(0, 10),
        lines: [EMPTY_LINE],
      });
      setSelectedId(body.data.id);
      invalidate();
      toast.success("NF registrada com sucesso");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const materialOptions: FormSelectOption[] = catalog.map((m) => ({
    value: m.id,
    label: `${m.code} — ${m.name} (${m.unit})`,
  }));

  const locationOptions: FormSelectOption[] = buildLocationOptions(locations);

  const lineFields = [
    {
      key: "materialId" as const,
      type: "select" as const,
      label: "Material",
      placeholder: "Selecione...",
      options: materialOptions,
      required: true,
    },
    {
      key: "locationId" as const,
      type: "select" as const,
      label: "Local",
      placeholder: "Selecione...",
      options: locationOptions,
      required: true,
    },
    {
      key: "quantity" as const,
      type: "number" as const,
      label: "Qtd",
      placeholder: "1",
      min: 1,
      required: true,
    },
    {
      key: "unitCostCents" as const,
      type: "money" as const,
      label: "Custo unit. (R$)",
      placeholder: "0,00",
      required: true,
    },
  ];

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Entradas</h2>

      {canEdit && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Registrar Nova NF</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <FormInput
                  {...form.register("number")}
                  label="Número da NF"
                  placeholder="Número da NF"
                  error={form.formState.errors.number?.message}
                />
                <FormInput
                  {...form.register("supplier")}
                  label="Fornecedor"
                  placeholder="Fornecedor"
                  error={form.formState.errors.supplier?.message}
                />
                <FormDate
                  {...form.register("issuedAt")}
                  label="Data de Emissão"
                  error={form.formState.errors.issuedAt?.message}
                />
              </div>

              <LineItemArray
                items={form.watch("lines") || [EMPTY_LINE]}
                onItemsChange={(items) => form.setValue("lines", items, { shouldValidate: true })}
                fields={lineFields}
                emptyItem={EMPTY_LINE}
                addButtonLabel="+ Adicionar item"
                canRemove={true}
              />

              <FormActions
                onSubmit={() => form.handleSubmit((data) => createMutation.mutate(data))()}
                submitLabel="Registrar NF"
                isSubmitting={createMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                A NF soma o estoque, gera INBOUND por item e atualiza o custo médio. NFs são imutáveis.
              </p>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3 md:flex-row">
        <div className="w-full flex-shrink-0 md:w-72">
          <h3 className="mb-2 text-sm font-semibold">Notas registradas</h3>
          {invoices.map((inv) => (
            <Button
              key={inv.id}
              variant={selectedId === inv.id ? "default" : "ghost"}
              className="mb-1.5 w-full justify-start gap-2"
              onClick={() => setSelectedId(inv.id)}
            >
              <FileText className="h-4 w-4" />
              <div className="text-left flex-1">
                <span className="font-mono font-semibold block">NF {inv.number}</span>
                <span className="text-xs text-muted-foreground block">
                  {inv.supplier} · {inv.linesCount} itens · ×{inv.totalQuantity} ·{" "}
                  {formatCents(inv.totalCostCents)}
                </span>
              </div>
            </Button>
          ))}
          {invoices.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma NF registrada.</p>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {!selectedId ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              Selecione uma NF para ver os itens.
            </div>
          ) : isFetchingDetail && !detail ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : detailError && !detail ? (
            <div className="flex flex-col items-center justify-center gap-3 h-64 text-center">
              <p className="text-sm text-destructive" role="alert">
                {detailError instanceof Error ? detailError.message : "Falha ao carregar a NF."}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetchDetail()}>
                Tentar de novo
              </Button>
            </div>
          ) : detail ? (
            <div>
              <h3 className="mb-1 text-sm font-semibold">
                NF {detail.number} — {detail.supplier}
              </h3>
              <p className="mb-2 text-xs text-muted-foreground">
                Emitida em {new Date(detail.issuedAt).toLocaleDateString("pt-BR")} · Total{" "}
                {formatCents(detail.totalCostCents)}
              </p>
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-muted/50 bg-muted/50">
                          <th className="text-left p-3 font-medium">Material</th>
                          <th className="text-left p-3 font-medium">Qtd</th>
                          <th className="text-left p-3 font-medium">Custo un.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.lines.map((line) => (
                          <tr key={line.id} className="border-b border-muted/50 hover:bg-muted/50">
                            <td className="p-3">
                              <span className="font-mono text-primary mr-2">{line.material.code}</span>
                              {line.material.name}
                            </td>
                            <td className="p-3">×{line.quantity} {line.material.unit}</td>
                            <td className="p-3">{formatCents(line.unitCostCents)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}