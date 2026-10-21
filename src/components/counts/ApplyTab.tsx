"use client";

import { useState } from "react";
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

interface CountedCountList {
  id: string;
  number: number;
  reason: string;
  createdAt: string;
  location: { id: string; name: string } | null;
  user: { name: string } | null;
  _count: { items: number };
  status: string;
}

interface CountedCountDetail extends CountedCountList {
  items: CountItem[];
}

async function fetchCountedCounts(): Promise<CountedCountList[]> {
  const response = await fetch("/api/counts?status=COUNTED");
  if (!response.ok) throw new Error("Failed to load counted counts");
  const body = await safeJson(response);
  return (body as { data?: CountedCountList[] })?.data ?? [];
}

async function fetchCountDetail(id: string): Promise<CountedCountDetail> {
  const response = await fetch(`/api/counts/${id}`);
  if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), "Failed to load count"));
  const body = await safeJson(response) as { data: CountedCountDetail };
  return body.data;
}

interface ApplyTabProps {
  onCountApplied: () => void;
}

export function ApplyTab({ onCountApplied }: ApplyTabProps) {
  const queryClient = useQueryClient();
  const canEdit = useCanEdit();
  const isAdmin = canEdit; // In this app, canEdit means ADMIN or OPERATOR, but only ADMIN can apply
  const [selectedCountId, setSelectedCountId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const { data: counts = [], isLoading, refetch } = useQuery({
    queryKey: ["counted-counts"],
    queryFn: fetchCountedCounts,
  });

  const { data: detail, isFetching } = useQuery({
    queryKey: ["count-detail-apply", selectedCountId],
    queryFn: () => fetchCountDetail(selectedCountId as string),
    enabled: selectedCountId !== null,
  });

  const applyMutation = useMutation({
    mutationFn: async (countId: string) => {
      const response = await fetch(`/api/counts/${countId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), "Failed to apply count"));
      return response.json();
    },
    onSuccess: () => {
      toast.success("Contagem aplicada ao estoque!");
      queryClient.invalidateQueries({ queryKey: ["counted-counts"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onCountApplied();
      setSelectedCountId(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: async ({ countId, reason }: { countId: string; reason: string }) => {
      const response = await fetch(`/api/counts/${countId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), "Failed to cancel count"));
      return response.json();
    },
    onSuccess: () => {
      toast.success("Contagem cancelada");
      queryClient.invalidateQueries({ queryKey: ["counted-counts"] });
      setSelectedCountId(null);
      setCancelReason("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleCancel = () => {
    if (!selectedCountId || !cancelReason.trim()) {
      toast.error("Informe o motivo do cancelamento");
      return;
    }
    cancelMutation.mutate({ countId: selectedCountId, reason: cancelReason.trim() });
  };

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Apenas administradores podem aplicar contagens ao estoque.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Contagens para Aplicar</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-24">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : counts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma contagem aguardando aplicação.
            </p>
          ) : (
            <div className="space-y-2">
              {counts.map((count) => (
                <button
                  key={count.id}
                  type="button"
                  onClick={() => {
                    setSelectedCountId(count.id);
                    setCancelReason("");
                  }}
                  className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-3 text-left rounded-lg border ${
                    selectedCountId === count.id
                      ? "border-primary bg-primary/5"
                      : "border-muted/50 hover:bg-muted/50"
                  }`}
                >
                  <Badge variant="success" className="shrink-0">
                    #{count.number} · CONTADA
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
              <Badge variant="success">CONTADA</Badge>
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
                    const diff = (item.countedQuantity ?? 0) - item.systemQuantity;
                    return (
                      <tr key={item.materialId} className="border-b border-muted/50 hover:bg-muted/50">
                        <td className="p-3 font-mono font-semibold text-primary">{item.material.code}</td>
                        <td className="p-3">{item.material.name}</td>
                        <td className="p-3">×{item.systemQuantity}</td>
                        <td className="p-3">×{item.countedQuantity ?? 0}</td>
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

            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button
                variant="outline"
                onClick={() => setSelectedCountId(null)}
              >
                Voltar
              </Button>
              <Button
                variant="destructive"
                onClick={() => setCancelReason("")}
                className="flex-1"
              >
                Cancelar Contagem
              </Button>
              <Button
                onClick={() => applyMutation.mutate(selectedCountId)}
                disabled={applyMutation.isPending}
                className="flex-1"
              >
                {applyMutation.isPending ? "Aplicando…" : "Aplicar ao Estoque"}
              </Button>
            </div>

            {cancelReason || applyMutation.variables === selectedCountId ? (
              <div className="border-t pt-4">
                <FormInput
                  label="Motivo do cancelamento"
                  placeholder="Ex.: contagem incorreta, obra cancelada, etc."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  required={true}
                />
                <div className="flex gap-2 mt-2">
                  <Button variant="outline" onClick={() => setCancelReason("")}>
                    Voltar
                  </Button>
                  <Button variant="destructive" onClick={handleCancel} disabled={cancelMutation.isPending || !cancelReason.trim()}>
                    {cancelMutation.isPending ? "Cancelando…" : "Confirmar Cancelamento"}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}