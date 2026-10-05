"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCanEdit } from "@/hooks/use-me";
import { apiErrorMessage, safeJson } from "@/lib/api-client";
import { useZodForm } from "@/hooks/use-form";
import { returnSchema, type ReturnFormData } from "@/lib/schemas";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { FormInput, FormSelect, FormActions, LineItemArray, type FormSelectOption } from "@/components/ui/forms";
import { toast } from "sonner";

interface ClosedIssue {
  id: string;
  number: number;
  ot: string | null;
  destination: string;
  items: {
    quantity: number;
    fulfilledQuantity: number;
    material: { id: string; code: string; name: string; unit: string };
  }[];
}

interface ReturnSummary {
  id: string;
  number: number;
  reason: string;
  createdAt: string;
  issue: { number: number; ot: string | null; destination: string };
  items: {
    quantity: number;
    material: { code: string; name: string; unit: string };
    location: { name: string };
  }[];
}

interface IssueOrigins {
  origins: { materialId: string; locationId: string; locationName: string; taken: number }[];
}

async function fetchIssueOrigins(issueId: string): Promise<IssueOrigins> {
  const response = await fetch(`/api/issues/${issueId}`);
  if (!response.ok) throw new Error("Failed to load issue");
  const body = await safeJson(response);
  return (body as { data?: IssueOrigins })?.data ?? { origins: [] };
}

async function fetchClosedIssues(): Promise<ClosedIssue[]> {
  const response = await fetch("/api/issues?status=CLOSED");
  if (!response.ok) throw new Error("Failed to load issues");
  const body = await safeJson(response);
  return (body as { data?: ClosedIssue[] })?.data ?? [];
}

async function fetchReturns(): Promise<ReturnSummary[]> {
  const response = await fetch("/api/returns");
  if (!response.ok) throw new Error("Failed to load returns");
  const body = await safeJson(response);
  return (body as { data?: ReturnSummary[] })?.data ?? [];
}

const EMPTY_LINE = { materialId: "", quantity: 1 };

export default function DevolucoesPage() {
  const queryClient = useQueryClient();
  const canEdit = useCanEdit();
  const [selectedIssueId, setSelectedIssueId] = useState("");

  const { data: issues = [] } = useQuery({ queryKey: ["issues", "CLOSED"], queryFn: fetchClosedIssues });
  const { data: returns = [] } = useQuery({ queryKey: ["returns"], queryFn: fetchReturns });

  const selectedIssue = issues.find((i) => i.id === selectedIssueId) ?? null;
  const { data: originData } = useQuery({
    queryKey: ["issue-origins", selectedIssueId],
    queryFn: () => fetchIssueOrigins(selectedIssueId),
    enabled: selectedIssueId !== "",
  });
  const originByMaterial = new Map<string, { locationName: string; taken: number }[]>();
  for (const o of originData?.origins ?? []) {
    const list = originByMaterial.get(o.materialId) ?? [];
    list.push({ locationName: o.locationName, taken: o.taken });
    originByMaterial.set(o.materialId, list);
  }

  const form = useZodForm<ReturnFormData>(returnSchema, {
    defaultValues: {
      issueId: "",
      reason: "",
      items: [EMPTY_LINE],
    },
  });

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ["returns"] });
    void queryClient.invalidateQueries({ queryKey: ["tree"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const createMutation = useMutation({
    mutationFn: async (data: ReturnFormData) => {
      const response = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), "Create failed"));
      return response.json();
    },
    onSuccess: () => {
      form.reset({
        issueId: "",
        reason: "",
        items: [EMPTY_LINE],
      });
      setSelectedIssueId("");
      invalidate();
      toast.success("Devolução registrada com sucesso");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const issueOptions: FormSelectOption[] = issues.map((i) => ({
    value: i.id,
    label: `#${i.number}${i.ot ? ` · ${i.ot}` : ""} — ${i.destination}`,
  }));

  const materialOptions: FormSelectOption[] = selectedIssue
    ? selectedIssue.items
        .filter((item) => item.fulfilledQuantity > 0)
        .map((item) => ({
          value: item.material.id,
          label: `${item.material.code} — ${item.material.name} (atendido ×${item.fulfilledQuantity})`,
        }))
    : [];

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
      key: "quantity" as const,
      type: "number" as const,
      label: "Qtd",
      placeholder: "1",
      min: 1,
      required: true,
    },
  ];

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Devoluções</h2>

      {canEdit && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Registrar Devolução</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormSelect
                  value={form.watch("issueId")}
                  onValueChange={(value) => {
                    form.setValue("issueId", value);
                    form.setValue("items", [EMPTY_LINE]);
                    setSelectedIssueId(value);
                  }}
                  label="Saída de origem"
                  placeholder="Selecione..."
                  options={issueOptions}
                  required={true}
                  error={form.formState.errors.issueId?.message}
                />
                <FormInput
                  {...form.register("reason")}
                  label="Motivo"
                  placeholder="Motivo da devolução"
                  error={form.formState.errors.reason?.message}
                />
              </div>

              {selectedIssue && (
                <p className="text-xs text-muted-foreground">
                  Itens atendidos na origem (voltam para onde saíram):{' '}
                  {selectedIssue.items
                    .filter((item) => item.fulfilledQuantity > 0)
                    .map((item) => {
                      const origins = originByMaterial.get(item.material.id) ?? [];
                      const where = origins.length > 0
                        ? origins.map((o) => o.locationName).join(" + ")
                        : "origem…";
                      return `${item.material.code} ×${item.fulfilledQuantity} → ${where}`;
                    })
                    .join(" · ")}
                </p>
              )}

              <LineItemArray
                items={form.watch("items") || [EMPTY_LINE]}
                onItemsChange={(items) => form.setValue("items", items, { shouldValidate: true })}
                fields={lineFields}
                emptyItem={EMPTY_LINE}
                addButtonLabel="+ Adicionar item"
                canRemove={true}
              />

              <FormActions
                onSubmit={() => form.handleSubmit((data) => createMutation.mutate(data))()}
                submitLabel="Registrar devolução"
                isSubmitting={createMutation.isPending}
              />
            </form>
          </CardContent>
        </Card>
      )}

      <h3 className="mb-2 text-sm font-semibold">Devoluções registradas</h3>
      {returns.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma devolução registrada.</p>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-muted/50 bg-muted/50">
                    <th className="text-left p-3 font-medium">Nº</th>
                    <th className="text-left p-3 font-medium">Origem</th>
                    <th className="text-left p-3 font-medium">Itens</th>
                    <th className="text-left p-3 font-medium">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map((r) => (
                    <tr key={r.id} className="border-b border-muted/50 hover:bg-muted/50">
                      <td className="p-3 font-mono font-semibold">#{r.number}</td>
                      <td className="p-3">
                        Saída #{r.issue.number}
                        {r.issue.ot ? ` · ${r.issue.ot}` : ""} — {r.issue.destination}
                      </td>
                      <td className="p-3">
                        {r.items.map((item, i) => (
                          <span key={i} className="mr-2">
                            {item.material.code} ×{item.quantity} → {item.location.name}
                          </span>
                        ))}
                      </td>
                      <td className="p-3 text-muted-foreground">{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}