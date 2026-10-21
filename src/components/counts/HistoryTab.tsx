"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiErrorMessage, safeJson } from "@/lib/api-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

interface CountItem {
  material: { code: string; name: string; unit: string };
  systemQuantity: number;
  countedQuantity: number;
  difference: number;
}

interface CountSummaryList {
  id: string;
  number: number;
  reason: string;
  createdAt: string;
  location: { id: string; name: string } | null;
  user: { name: string } | null;
  status: string;
  appliedAt: string | null;
  cancelledAt: string | null;
  _count: { items: number };
  divergenceCount: number;
}

interface CountSummaryDetail extends CountSummaryList {
  items: CountItem[];
}

async function fetchAllCounts(): Promise<CountSummaryList[]> {
  const response = await fetch("/api/counts");
  if (!response.ok) throw new Error("Failed to load counts");
  const body = await safeJson(response);
  return (body as { data?: CountSummaryList[] })?.data ?? [];
}

async function fetchCountDetail(id: string): Promise<CountSummaryDetail> {
  const response = await fetch(`/api/counts/${id}`);
  if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), "Failed to load count"));
  const body = await safeJson(response) as { data: CountSummaryDetail };
  return body.data;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  COUNTED: "Contada",
  APPLIED: "Aplicada",
  CANCELLED: "Cancelada",
};

const STATUS_VARIANT: Record<string, "default" | "warning" | "success" | "destructive" | "secondary"> = {
  PENDING: "warning",
  COUNTED: "success",
  APPLIED: "default",
  CANCELLED: "destructive",
};

export function HistoryTab() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: counts = [], isLoading } = useQuery({
    queryKey: ["all-counts"],
    queryFn: fetchAllCounts,
  });

  const { data: detail, isFetching: detailFetching } = useQuery({
    queryKey: ["count-history-detail", expandedId],
    queryFn: () => fetchCountDetail(expandedId as string),
    enabled: expandedId !== null,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico de Contagens</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center h-24">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : counts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma contagem registrada.
          </p>
        ) : (
          <div className="space-y-2">
            {counts.map((count) => {
              const expanded = expandedId === count.id;
              const variant = STATUS_VARIANT[count.status] || "secondary";
              return (
                <div key={count.id} className="rounded-lg border border-muted/50">
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : count.id)}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-3 text-left hover:bg-muted/50"
                  >
                    <Badge variant={variant} className="shrink-0">
                      #{count.number}
                    </Badge>
                    <Badge variant="secondary" className="shrink-0 ml-1">
                      {STATUS_LABEL[count.status] || count.status}
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
                        {count.appliedAt
                          ? new Date(count.appliedAt).toLocaleDateString("pt-BR")
                          : count.cancelledAt
                          ? new Date(count.cancelledAt).toLocaleDateString("pt-BR")
                          : new Date(count.createdAt).toLocaleDateString("pt-BR")}
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
  );
}