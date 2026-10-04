"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCanEdit } from "@/hooks/use-me";
import { apiErrorMessage, safeJson } from "@/lib/api-client";
import { useZodForm } from "@/hooks/use-form";
import { adjustmentSchema, type AdjustmentFormData } from "@/lib/schemas";
import { findNode, type TreeNode } from "@/lib/warehouse";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FormInput, FormSelect, FormActions, type FormSelectOption } from "@/components/ui/forms";
import { toast } from "sonner";

async function fetchTree(): Promise<TreeNode[]> {
  const response = await fetch("/api/locations/tree");
  if (!response.ok) throw new Error("Failed to load locations");
  const body = await safeJson(response);
  return (body as { data?: TreeNode[] })?.data ?? [];
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
                              type="number"
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
    </div>
  );
}