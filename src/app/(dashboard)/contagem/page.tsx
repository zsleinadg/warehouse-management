"use client";

import { useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCanEdit } from "@/hooks/use-me";
import { apiErrorMessage, safeJson } from "@/lib/api-client";
import { useZodForm } from "@/hooks/use-form";
import { adjustmentSchema, type AdjustmentFormData } from "@/lib/schemas";
import { findNode, type TreeNode } from "@/lib/warehouse";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormInput, FormSelect, FormActions, type FormSelectOption } from "@/components/ui/forms";
import { toast } from "sonner";

async function fetchTree(): Promise<TreeNode[]> {
  const response = await fetch("/api/locations/tree");
  if (!response.ok) throw new Error("Failed to load locations");
  const body = await safeJson(response);
  return (body as { data?: TreeNode[] })?.data ?? [];
}

interface CountSummary {
  id: string;
  number: number;
  reason: string;
  createdAt: string;
  location: { id: string; name: string };
  user: { name: string } | null;
  itemCount: number;
  divergenceCount: number;
}

interface CountDetail extends CountSummary {
  items: {
    material: { code: string; name: string; unit: string };
    systemQuantity: number;
    countedQuantity: number;
    difference: number;
  }[];
}

async function fetchCounts(): Promise<CountSummary[]> {
  const response = await fetch("/api/adjustments?take=20");
  if (!response.ok) throw new Error("Failed to load counts");
  const body = await safeJson(response);
  return (body as { data?: CountSummary[] })?.data ?? [];
}

async function fetchCountDetail(id: string): Promise<CountDetail> {
  const response = await fetch(`/api/adjustments/${id}`);
  if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), "Failed to load count"));
  const body = await safeJson(response);
  return (body as { data: CountDetail }).data;
}

function flatten(nodes: TreeNode[], prefix: string[] = []): { id: string; path: string }[] {
  const out: { id: string; path: string }[] = [];
  for (const node of nodes) {
    const path = [...prefix, node.name];
    out.push({ id: node.id, path: path.join(" → ") });
    out.push(...flatten(node.children, path));
  }
  return out;
}

export default function ContagemPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
      <ContagemContent />
    </Suspense>
  );
}

function ContagemContent() {
  const queryClient = useQueryClient();
  const canEdit = useCanEdit();

  const { data: tree = [] } = useQuery({ queryKey: ["tree"], queryFn: fetchTree });
  const options = useMemo(() => flatten(tree), [tree]);

  const form = useZodForm<AdjustmentFormData>(adjustmentSchema, {
    defaultValues: {
      locationId: "",
      reason: "",
      items: [],
    },
  });

  const locationId = form.watch("locationId");
  const node = locationId ? findNode(tree, locationId) : null;

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ["tree"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    void queryClient.invalidateQueries({ queryKey: ["counts"] });
  }

  const countMutation = useMutation({
    mutationFn: async (data: AdjustmentFormData) => {
      const response = await fetch("/api/adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), "Count failed"));
      return response.json();
    },
    onSuccess: (body) => {
      const adjustments = body?.data?.adjustments ?? [];
      const message =
        adjustments.length === 0
          ? "Contagem sem divergências."
          : `${adjustments.length} divergência(s) ajustada(s).`;
      toast.success(message);
      form.reset({ locationId: "", reason: "", items: [] });
      invalidate();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const locationOptions: FormSelectOption[] = options.map((o) => ({
    value: o.id,
    label: o.path,
  }));

  const deepLinkedId = useSearchParams().get("count");
  const [expandedId, setExpandedId] = useState<string | null>(deepLinkedId);
  const { data: counts = [], isLoading: countsLoading } = useQuery({
    queryKey: ["counts"],
    queryFn: fetchCounts,
  });
  const { data: detail, isFetching: detailFetching } = useQuery({
    queryKey: ["count", expandedId],
    queryFn: () => fetchCountDetail(expandedId as string),
    enabled: expandedId !== null,
  });

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Contagem cíclica</h2>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Lançar Contagem</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit((data) => countMutation.mutate(data))} className="space-y-4">
            <FormSelect
              value={form.watch("locationId")}
              onValueChange={(value) => {
                form.setValue("locationId", value);
                if (value) {
                  const found = findNode(tree, value);
                  if (found) {
                    form.setValue(
                      "items",
                      found.stocks.map((stock) => ({
                        materialId: stock.material.id ?? "",
                        countedQuantity: stock.quantity,
                      }))
                    );
                  }
                } else {
                  form.setValue("items", []);
                }
              }}
              label="Localização"
              placeholder="Selecione a localização…"
              options={locationOptions}
              required={true}
              error={form.formState.errors.locationId?.message}
            />

            {!node ? (
              <p className="text-sm text-muted-foreground">Escolha uma localização para contar.</p>
            ) : node.stocks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum item nesta localização.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-muted/50 bg-muted/50">
                        <th className="text-left p-3 font-medium">Material</th>
                        <th className="text-left p-3 font-medium">Sistema</th>
                        <th className="text-left p-3 font-medium">Contado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {node.stocks.map((stock, index) => (
                        <tr key={stock.id} className="border-b border-muted/50 hover:bg-muted/50">
                          <td className="p-3">
                            <span className="font-mono text-primary mr-2">{stock.material.code}</span>
                            {stock.material.name}
                          </td>
                          <td className="p-3">×{stock.quantity}</td>
                          <td className="p-3">
                            <FormInput
                              {...form.register(`items.${index}.countedQuantity`)}
                              label=""
                              type="text"
                              inputMode="numeric"
                              autoComplete="off"
                              autoCapitalize="none"
                              autoCorrect="off"
                              min={0}
                              disabled={!canEdit}
                              className="w-24"
                              error={form.formState.errors.items?.[index]?.countedQuantity?.message}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <FormInput
                  {...form.register("reason")}
                  label="Motivo do ajuste"
                  placeholder="Motivo do ajuste (obrigatório)"
                  error={form.formState.errors.reason?.message}
                  required={true}
                />

                <FormActions
                  onSubmit={() => form.handleSubmit((data) => countMutation.mutate(data))()}
                  submitLabel="Lançar contagem"
                  isSubmitting={countMutation.isPending}
                  submitDisabled={!canEdit}
                />
              </>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contagens realizadas</CardTitle>
        </CardHeader>
        <CardContent>
          {countsLoading ? (
            <div className="flex items-center justify-center h-24">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : counts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma contagem registrada.</p>
          ) : (
            <div className="space-y-2">
              {counts.map((count) => {
                const expanded = expandedId === count.id;
                return (
                  <div key={count.id} className="rounded-lg border border-muted/50">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : count.id)}
                      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-3 text-left hover:bg-muted/50"
                    >
                      <Badge variant={count.divergenceCount > 0 ? "warning" : "success"} className="shrink-0">
                        #{count.number}
                      </Badge>
                      <div className="flex-1 min-w-0 basis-40">
                        <p className="font-medium truncate">{count.location.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[count.reason, `${count.itemCount} ${count.itemCount === 1 ? "item" : "itens"}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="ml-auto shrink-0 text-right">
                        <p className="text-xs text-muted-foreground">
                          {new Date(count.createdAt).toLocaleDateString("pt-BR")}
                        </p>
                        <p className="text-xs text-muted-foreground">{count.user?.name ?? "—"}</p>
                      </div>
                    </button>
                    {expanded && (
                      <div className="border-t border-muted/50 p-3">
                        {detailFetching || !detail || detail.id !== count.id ? (
                          <div className="flex items-center justify-center h-16">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-muted/50 bg-muted/50">
                                  <th className="text-left p-2 font-medium">Código</th>
                                  <th className="text-left p-2 font-medium">Material</th>
                                  <th className="text-left p-2 font-medium">Sistema</th>
                                  <th className="text-left p-2 font-medium">Contado</th>
                                  <th className="text-left p-2 font-medium">Diferença</th>
                                </tr>
                              </thead>
                              <tbody>
                                {detail.items.map((item) => (
                                  <tr
                                    key={item.material.code}
                                    className="border-b border-muted/50 hover:bg-muted/50"
                                  >
                                    <td className="p-2 font-mono font-semibold text-primary">
                                      {item.material.code}
                                    </td>
                                    <td className="p-2">{item.material.name}</td>
                                    <td className="p-2">{item.systemQuantity}</td>
                                    <td className="p-2">{item.countedQuantity}</td>
                                    <td
                                      className={
                                        item.difference === 0
                                          ? "p-2 text-muted-foreground"
                                          : "p-2 font-medium text-destructive"
                                      }
                                    >
                                      {item.difference > 0 ? `+${item.difference}` : item.difference}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}