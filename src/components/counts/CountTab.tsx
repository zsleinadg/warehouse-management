"use client";

import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCanEdit } from "@/hooks/use-me";
import { apiErrorMessage, safeJson } from "@/lib/api-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormInput } from "@/components/ui/forms";
import { toast } from "sonner";

interface CountItem {
  materialId: string;
  material: { code: string; name: string; unit: string };
  systemQuantity: number;
  countedQuantity: number | null;
  difference: number | null;
}

interface PendingCountList {
  id: string;
  number: number;
  reason: string;
  createdAt: string;
  location: { id: string; name: string } | null;
  user: { name: string } | null;
  _count: { items: number };
  status: string;
}

interface PendingCountDetail extends PendingCountList {
  items: CountItem[];
}

async function fetchPendingCounts(): Promise<PendingCountList[]> {
  const response = await fetch("/api/counts?status=PENDING");
  if (!response.ok) throw new Error("Failed to load pending counts");
  const body = await safeJson(response);
  return (body as { data?: PendingCountList[] })?.data ?? [];
}

async function fetchCountDetail(id: string): Promise<PendingCountDetail> {
  const response = await fetch(`/api/counts/${id}`);
  if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), "Failed to load count"));
  const body = await safeJson(response) as { data: PendingCountDetail };
  return body.data;
}

interface CountTabProps {
  onCountSaved: () => void;
}

export function CountTab({ onCountSaved }: CountTabProps) {
  const queryClient = useQueryClient();
  const canEdit = useCanEdit();
  const [selectedCountId, setSelectedCountId] = useState<string | null>(null);
  const [expandedCountId, setExpandedCountId] = useState<string | null>(null);
  const [countedQuantities, setCountedQuantities] = useState<Record<string, number>>({});

  const { data: counts = [], isLoading, refetch } = useQuery({
    queryKey: ["pending-counts"],
    queryFn: fetchPendingCounts,
  });

  const { data: detail, isFetching } = useQuery({
    queryKey: ["count-detail", selectedCountId],
    queryFn: () => fetchCountDetail(selectedCountId as string),
    enabled: selectedCountId !== null,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ countId, items }: { countId: string; items: { materialId: string; countedQuantity: number }[] }) => {
      const response = await fetch(`/api/counts/${countId}/count`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), "Failed to save count"));
      return response.json();
    },
    onSuccess: () => {
      toast.success("Quantidades salvas! Contagem finalizada.");
      queryClient.invalidateQueries({ queryKey: ["pending-counts"] });
      onCountSaved();
      setSelectedCountId(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleQuantityChange = (materialId: string, value: string) => {
    const num = value === "" ? 0 : parseInt(value, 10);
    setCountedQuantities((prev) => ({ ...prev, [materialId]: isNaN(num) ? 0 : num }));
  };

  const handleSave = () => {
    if (!selectedCountId || !detail) return;
    const items = detail.items.map((item) => ({
      materialId: item.materialId,
      countedQuantity: countedQuantities[item.materialId] ?? 0,
    }));
    saveMutation.mutate({ countId: selectedCountId, items });
  };

  const hasAllQuantities = detail?.items.every(
    (item) => countedQuantities[item.materialId] !== undefined
  );

  if (!canEdit) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Sem permissão para realizar contagens.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Contagens Pendentes</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-24">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : counts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma contagem pendente. Crie uma nova na aba &ldquo;Nova Contagem&rdquo;.
            </p>
          ) : (
            <div className="space-y-2">
              {counts.map((count) => (
                <button
                  key={count.id}
                  type="button"
                  onClick={() => {
                    setSelectedCountId(count.id);
                    setExpandedCountId((prev) => (prev === count.id ? null : count.id));
                    setCountedQuantities({});
                  }}
                  className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-3 text-left rounded-lg border ${
                    selectedCountId === count.id
                      ? "border-primary bg-primary/5"
                      : "border-muted/50 hover:bg-muted/50"
                  }`}
                >
                  <Badge variant="warning" className="shrink-0">
                    #{count.number} · PENDENTE
                  </Badge>
                  <div className="flex-1 min-w-0 basis-40">
                    <p className="font-medium truncate">
                      {count.location?.name || "Materiais específicos"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[count.reason, `${count._count.items} ${count._count.items === 1 ? "item" : "itens"}`]
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedCountId && detail && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Contagem #{detail.number} — {detail.location?.name || "Materiais específicos"}
              <Badge variant="warning">PENDENTE</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Motivo: {detail.reason} · Criada por {detail.user?.name} em{" "}
              {new Date(detail.createdAt).toLocaleDateString("pt-BR")}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-muted/50 bg-muted/50">
                    <th className="text-left p-3 font-medium">Código</th>
                    <th className="text-left p-3 font-medium">Material</th>
                    <th className="text-left p-3 font-medium">Sistema</th>
                    <th className="text-left p-3 font-medium">Contado</th>
                    <th className="text-left p-3 font-medium">Diferença</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((item) => {
                    const counted = countedQuantities[item.materialId] ?? 0;
                    const diff = counted - item.systemQuantity;
                    return (
                      <tr key={item.materialId} className="border-b border-muted/50 hover:bg-muted/50">
                        <td className="p-3 font-mono font-semibold text-primary">{item.material.code}</td>
                        <td className="p-3">{item.material.name}</td>
                        <td className="p-3">×{item.systemQuantity}</td>
                        <td className="p-3">
                          <FormInput
                            label=""
                            type="text"
                            inputMode="numeric"
                            autoComplete="off"
                            value={countedQuantities[item.materialId] ?? ""}
                            onChange={(e) => handleQuantityChange(item.materialId, e.target.value)}
                            className="w-24"
                            placeholder="0"
                          />
                        </td>
                        <td
                          className={
                            diff === 0
                              ? "p-3 text-muted-foreground"
                              : "p-3 font-medium text-destructive"
                          }
                        >
                          {diff > 0 ? `+${diff}` : diff}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedCountId(null);
                  setCountedQuantities({});
                }}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending || !hasAllQuantities}
              >
                {saveMutation.isPending ? "Salvando…" : "Finalizar Contagem"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}