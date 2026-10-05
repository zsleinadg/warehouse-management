"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCanEdit } from "@/hooks/use-me";
import { apiErrorMessage, safeJson } from "@/lib/api-client";
import { useZodForm } from "@/hooks/use-form";
import { issueSchema, type IssueFormData } from "@/lib/schemas";
import { buildLocationOptions } from "@/lib/location-options";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormInput, FormSelect, FormActions, LineItemArray, type FormSelectOption } from "@/components/ui/forms";
import { toast } from "sonner";
import { FileText, X } from "lucide-react";

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

interface IssueItem {
  quantity: number;
  fulfilledQuantity: number;
  isExtra: boolean;
  additions: { id: string; quantity: number; createdAt: string; user: { name: string } | null }[];
  material: { code: string; name: string; unit: string };
}

interface IssueSummary {
  id: string;
  number: number;
  ot: string | null;
  kind: "OBRA" | "EMERGENCIAL";
  vehiclePlate: string | null;
  nfNumber: string | null;
  destination: string;
  foreman: string | null;
  status: "DRAFT" | "CLOSED" | "CANCELLED";
  createdAt: string;
  user?: { name: string } | null;
  items: IssueItem[];
}

interface IssueDetail extends IssueSummary {
  notes: string | null;
  cancelReason: string | null;
  cancelledAt: string | null;
  updatedAt: string;
  returns: { id: string; number: number; reason: string; createdAt: string }[];
}

async function fetchIssues(status: string, kind: string): Promise<IssueSummary[]> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (kind) params.set("kind", kind);
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await fetch(`/api/issues${query}`);
  if (!response.ok) throw new Error("Failed to load issues");
  const body = await safeJson(response);
  return (body as { data?: IssueSummary[] })?.data ?? [];
}

async function fetchCatalog(): Promise<CatalogMaterial[]> {
  const response = await fetch("/api/materials");
  if (!response.ok) throw new Error("Failed to load catalog");
  const body = await safeJson(response);
  return ((body as { data?: CatalogMaterial[] })?.data ?? []).filter((m: CatalogMaterial) => !m.disabled);
}

async function fetchLocations(): Promise<LocationOption[]> {
  const response = await fetch("/api/locations");
  if (!response.ok) throw new Error("Failed to load locations");
  const body = await safeJson(response);
  return ((body as { data?: LocationOption[] })?.data ?? []).filter((l: LocationOption) => !l.disabled);
}

const EMPTY_LINE = { materialId: "", quantity: 1 };

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  CLOSED: "Atendida",
  CANCELLED: "Cancelada",
};

const KIND_LABEL: Record<string, string> = {
  OBRA: "Obra",
  EMERGENCIAL: "Emergencial",
};

const KIND_OPTIONS: FormSelectOption[] = [
  { value: "OBRA", label: "Obra (grande — postes, transformadores)" },
  { value: "EMERGENCIAL", label: "Emergencial (última hora)" },
];

export default function SaidasPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
      <SaidasContent />
    </Suspense>
  );
}

function SaidasContent() {
  const queryClient = useQueryClient();
  const canEdit = useCanEdit();
  const [statusFilter, setStatusFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Deep-link do dashboard (?id=): seleciona a OT ao chegar.
  const searchId = useSearchParams().get("id");
  const [appliedSearchId, setAppliedSearchId] = useState<string | null>(null);
  if (searchId !== appliedSearchId) {
    setAppliedSearchId(searchId);
    if (searchId) setSelectedId(searchId);
  }

  // Cancelamento de rascunho (motivo obrigatório)
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  // Cancelamento de atendida com estorno
  const [showRevertForm, setShowRevertForm] = useState(false);
  const [revertReason, setRevertReason] = useState("");
  const [revertLocationId, setRevertLocationId] = useState("");
  // Acréscimo em rascunho
  const [extraItems, setExtraItems] = useState([{ ...EMPTY_LINE }]);

  const { data: issues = [] } = useQuery({
    queryKey: ["issues", statusFilter, kindFilter],
    queryFn: () => fetchIssues(statusFilter, kindFilter),
  });
  const { data: catalog = [] } = useQuery({ queryKey: ["materials"], queryFn: fetchCatalog });
  const { data: locations = [] } = useQuery({ queryKey: ["locations"], queryFn: fetchLocations });
  const { data: detail, error: detailError, isFetching: isFetchingDetail, refetch: refetchDetail } = useQuery({
    queryKey: ["issue", selectedId],
    queryFn: async (): Promise<IssueDetail | null> => {
      if (!selectedId) return null;
      const response = await fetch(`/api/issues/${selectedId}`);
      if (!response.ok) {
        const body = await safeJson(response).catch(() => null);
        throw new Error(apiErrorMessage(body, `Falha ao carregar a OT (HTTP ${response.status})`));
      }
      const body = await safeJson(response);
      return (body as { data?: IssueDetail })?.data ?? null;
    },
    enabled: selectedId !== null,
    retry: 1,
  });

  const form = useZodForm<IssueFormData>(issueSchema, {
    defaultValues: {
      ot: "",
      kind: "OBRA",
      vehiclePlate: "",
      nfNumber: "",
      destination: "",
      foreman: "",
      notes: "",
      items: [EMPTY_LINE],
    },
  });

  const watchedKind = form.watch("kind");

  function invalidate(): void {
    void queryClient.invalidateQueries({ queryKey: ["issues"] });
    void queryClient.invalidateQueries({ queryKey: ["issue", selectedId] });
    void queryClient.invalidateQueries({ queryKey: ["tree"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const createMutation = useMutation({
    mutationFn: async (data: IssueFormData) => {
      const response = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), "Create failed"));
      return response.json();
    },
    onSuccess: (body) => {
      form.reset({
        ot: "",
        kind: "OBRA",
        vehiclePlate: "",
        nfNumber: "",
        destination: "",
        foreman: "",
        notes: "",
        items: [EMPTY_LINE],
      });
      setSelectedId(body.data.id);
      invalidate();
      toast.success("Requisição criada com sucesso");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const actionMutation = useMutation({
    mutationFn: async ({
      action,
      id,
      reason,
      returnsTo,
    }: {
      action: "close" | "cancel" | "cancel-closed";
      id: string;
      reason?: string;
      returnsTo?: { materialId: string; locationId: string }[];
    }) => {
      const response = await fetch(`/api/issues/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason, returnsTo }),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), `${action} failed`));
    },
    onSuccess: (_, variables) => {
      setShowCancelForm(false);
      setCancelReason("");
      setShowRevertForm(false);
      setRevertReason("");
      setRevertLocationId("");
      invalidate();
      toast.success(
        variables.action === "close"
          ? "Requisição atendida"
          : variables.action === "cancel"
            ? "Requisição cancelada"
            : "Requisição cancelada com estorno ao estoque",
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const addItemsMutation = useMutation({
    mutationFn: async ({ id, items }: { id: string; items: { materialId: string; quantity: number }[] }) => {
      const response = await fetch(`/api/issues/${id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), "Add failed"));
    },
    onSuccess: () => {
      setExtraItems([{ ...EMPTY_LINE }]);
      invalidate();
      toast.success("Acréscimo adicionado à requisição");
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
      key: "quantity" as const,
      type: "number" as const,
      label: "Qtd",
      placeholder: "1",
      min: 1,
      required: true,
    },
  ];

  function handleAddExtra(): void {
    if (!selectedId) return;
    const valid = extraItems.filter((l) => l.materialId && l.quantity >= 1);
    if (valid.length === 0) {
      toast.error("Adicione ao menos um material com quantidade");
      return;
    }
    addItemsMutation.mutate({ id: selectedId, items: valid });
  }

  function handleConfirmCancel(): void {
    if (!selectedId || !cancelReason.trim()) {
      toast.error("Informe o motivo do cancelamento");
      return;
    }
    actionMutation.mutate({ action: "cancel", id: selectedId, reason: cancelReason.trim() });
  }

  function handleConfirmRevert(): void {
    if (!selectedId || !revertReason.trim()) {
      toast.error("Informe o motivo do cancelamento");
      return;
    }
    if (!revertLocationId) {
      toast.error("Escolha o local para onde o material volta");
      return;
    }
    const returnsTo = (detail?.items ?? [])
      .filter((item) => item.fulfilledQuantity > 0)
      .map((item) => {
        const material = catalog.find((m) => m.code === item.material.code);
        return material ? { materialId: material.id, locationId: revertLocationId } : null;
      })
      .filter((t): t is { materialId: string; locationId: string } => t !== null);
    actionMutation.mutate({ action: "cancel-closed", id: selectedId, reason: revertReason.trim(), returnsTo });
  }

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Saídas</h2>

      {canEdit && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Nova Requisição</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <FormInput
                  {...form.register("ot")}
                  label="OT"
                  placeholder="Ex.: OT-123"
                  error={form.formState.errors.ot?.message}
                />
                <FormInput
                  {...form.register("destination")}
                  label="Obra / Destino"
                  placeholder="Obra / Destino"
                  error={form.formState.errors.destination?.message}
                />
                <FormInput
                  {...form.register("foreman")}
                  label="Encarregado"
                  placeholder="Encarregado"
                  error={form.formState.errors.foreman?.message}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <FormSelect
                  value={watchedKind}
                  onValueChange={(value) => form.setValue("kind", value as "OBRA" | "EMERGENCIAL", { shouldValidate: true })}
                  label="Tipo"
                  options={KIND_OPTIONS}
                  error={form.formState.errors.kind?.message}
                />
                <FormInput
                  {...form.register("vehiclePlate")}
                  label="Placa do veículo"
                  placeholder="Ex.: ABC1D23"
                  error={form.formState.errors.vehiclePlate?.message}
                />
                <FormInput
                  {...form.register("nfNumber")}
                  label="NF de saída"
                  placeholder="Número da NF"
                  error={form.formState.errors.nfNumber?.message}
                />
              </div>

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
                submitLabel="Abrir requisição"
                isSubmitting={createMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">
                O rascunho não movimenta estoque. O atendimento acontece ao fechar, com parcial permitido.
              </p>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="mb-2 flex flex-wrap gap-2 text-sm">
        {(["", "DRAFT", "CLOSED", "CANCELLED"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-md border px-2 py-1 ${
              statusFilter === s
                ? "border-sky-400 bg-sky-100 font-semibold dark:bg-sky-950"
                : "border-zinc-200 dark:border-zinc-700"
            }`}
          >
            {s === "" ? "Todas" : STATUS_LABEL[s]}
          </button>
        ))}
        <span className="mx-1 self-center text-zinc-300">|</span>
        {(["", "OBRA", "EMERGENCIAL"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKindFilter(k)}
            className={`rounded-md border px-2 py-1 ${
              kindFilter === k
                ? "border-amber-400 bg-amber-100 font-semibold dark:bg-amber-950"
                : "border-zinc-200 dark:border-zinc-700"
            }`}
          >
            {k === "" ? "Obra + Emergencial" : KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="w-full flex-shrink-0 lg:w-72">
          <h3 className="mb-2 text-sm font-semibold">Requisições</h3>
          {issues.map((issue) => (
            <Button
              key={issue.id}
              variant={selectedId === issue.id ? "default" : "ghost"}
              className="mb-1.5 h-auto w-full justify-start gap-2 py-2"
              onClick={() => {
                setSelectedId(issue.id);
                setShowCancelForm(false);
                setShowRevertForm(false);
              }}
            >
              <FileText className="h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1 text-left">
                <span className="block font-mono font-semibold">
                  #{issue.number}{" "}
                  <Badge variant={issue.kind === "EMERGENCIAL" ? "warning" : "secondary"} className="ml-1">
                    {KIND_LABEL[issue.kind]}
                  </Badge>
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {issue.ot && `${issue.ot} · `}{issue.destination} · {issue.items.length} itens ·{" "}
                  {STATUS_LABEL[issue.status]}
                </span>
              </div>
            </Button>
          ))}
          {issues.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma requisição.</p>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {!selectedId ? (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              Selecione uma requisição para ver os itens.
            </div>
          ) : isFetchingDetail && !detail ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : detailError && !detail ? (
            <div className="flex flex-col items-center justify-center gap-3 h-64 text-center">
              <p className="text-sm text-destructive" role="alert">
                {detailError instanceof Error ? detailError.message : "Falha ao carregar a OT."}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetchDetail()}>
                Tentar de novo
              </Button>
            </div>
          ) : detail ? (
            <div>
              <h3 className="mb-1 flex flex-wrap items-center gap-2 text-sm font-semibold">
                Requisição #{detail.number}
                <Badge variant={detail.kind === "EMERGENCIAL" ? "warning" : "secondary"}>
                  {KIND_LABEL[detail.kind]}
                </Badge>
                {detail.ot && <span>· {detail.ot}</span>}
                <span>· {STATUS_LABEL[detail.status]}</span>
              </h3>
              <p className="mb-2 text-xs text-muted-foreground">
                {detail.destination}
                {detail.foreman && ` · Encarregado: ${detail.foreman}`}
                {detail.vehiclePlate && ` · Placa: ${detail.vehiclePlate}`}
                {detail.nfNumber && ` · NF: ${detail.nfNumber}`}
                {detail.user && ` · Por: ${detail.user.name}`}
              </p>
              {detail.status === "CANCELLED" && detail.cancelReason && (
                <p className="mb-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                  Cancelada: {detail.cancelReason}
                </p>
              )}
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead>
                        <tr className="border-b border-muted/50 bg-muted/50">
                          <th className="text-left p-3 font-medium">Material</th>
                          <th className="text-left p-3 font-medium">Pedido</th>
                          <th className="text-left p-3 font-medium">Atendido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.items.map((item, i) => {
                          const addedTotal = item.additions.reduce((sum, a) => sum + a.quantity, 0);
                          const baseQuantity = Math.max(item.quantity - addedTotal, 0);
                          return (
                          <tr key={i} className="border-b border-muted/50 hover:bg-muted/50">
                            <td className="p-3">
                              <span className="font-mono text-primary mr-2 whitespace-nowrap">{item.material.code}</span>
                              {item.material.name}
                              {item.isExtra && (
                                <Badge variant="warning" className="ml-1.5">
                                  acréscimo
                                </Badge>
                              )}
                              {item.additions.length > 0 && (
                                <span className="mt-1 block text-[11px] text-muted-foreground">
                                  Pedido {baseQuantity}
                                  {item.additions.map((a) => (
                                    <span key={a.id} className="block">
                                      +{a.quantity} acréscimo · {new Date(a.createdAt).toLocaleDateString("pt-BR")}
                                      {a.user ? ` · ${a.user.name}` : ""}
                                    </span>
                                  ))}
                                </span>
                              )}
                            </td>
                            <td className="p-3 whitespace-nowrap">×{item.quantity}</td>
                            <td className="p-3 whitespace-nowrap">
                              ×{item.fulfilledQuantity}
                              {detail.status === "CLOSED" && item.fulfilledQuantity < item.quantity && (
                                <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                                  parcial
                                </span>
                              )}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {canEdit && detail.status === "DRAFT" && (
                <Card className="mt-3">
                  <CardHeader>
                    <CardTitle className="text-sm">Acréscimo (antes da entrega)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <LineItemArray
                      items={extraItems}
                      onItemsChange={setExtraItems}
                      fields={lineFields}
                      emptyItem={EMPTY_LINE}
                      addButtonLabel="+ Adicionar linha"
                      canRemove={true}
                    />
                    <Button onClick={handleAddExtra} disabled={addItemsMutation.isPending} variant="secondary">
                      {addItemsMutation.isPending ? "Adicionando…" : "Adicionar acréscimo"}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Itens novos ou quantidades somadas entram marcados como acréscimo.
                    </p>
                  </CardContent>
                </Card>
              )}

              {canEdit && detail.status === "DRAFT" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    onClick={() => selectedId && actionMutation.mutate({ action: "close", id: selectedId })}
                    className="gap-2"
                    disabled={actionMutation.isPending}
                  >
                    Atender (fechar)
                  </Button>
                  {!showCancelForm ? (
                    <Button
                      variant="destructive"
                      onClick={() => setShowCancelForm(true)}
                      disabled={actionMutation.isPending}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancelar
                    </Button>
                  ) : (
                    <div className="flex w-full flex-col gap-2 rounded-lg border border-red-200 bg-red-50/50 p-2.5 sm:flex-row sm:items-end dark:border-red-900">
                      <FormInput
                        label="Motivo do cancelamento"
                        placeholder="Ex.: obra cancelada antes da retirada"
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                      />
                      <div className="flex shrink-0 gap-2">
                        <Button
                          variant="destructive"
                          onClick={handleConfirmCancel}
                          disabled={actionMutation.isPending || !cancelReason.trim()}
                        >
                          Confirmar
                        </Button>
                        <Button variant="ghost" onClick={() => { setShowCancelForm(false); setCancelReason(""); }}>
                          Voltar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {canEdit && detail.status === "CLOSED" && (
                <div className="mt-3">
                  {!showRevertForm ? (
                    <Button
                      variant="destructive"
                      onClick={() => setShowRevertForm(true)}
                      disabled={actionMutation.isPending}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Cancelar com estorno
                    </Button>
                  ) : (
                    <Card className="border-red-200 dark:border-red-900">
                      <CardContent className="space-y-3 pt-4">
                        <p className="text-xs text-muted-foreground">
                          Todo o quantitativo atendido volta ao estoque com movimento de estorno vinculado a esta OT.
                        </p>
                        <FormInput
                          label="Motivo do cancelamento"
                          placeholder="Ex.: obra cancelada após a retirada"
                          value={revertReason}
                          onChange={(e) => setRevertReason(e.target.value)}
                        />
                        <FormSelect
                          value={revertLocationId}
                          onValueChange={setRevertLocationId}
                          label="Local de retorno (todos os itens)"
                          options={locationOptions}
                          placeholder="Selecione o local..."
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="destructive"
                            onClick={handleConfirmRevert}
                            disabled={actionMutation.isPending || !revertReason.trim() || !revertLocationId}
                          >
                            Confirmar estorno
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => { setShowRevertForm(false); setRevertReason(""); setRevertLocationId(""); }}
                          >
                            Voltar
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {detail.returns.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Devoluções: {detail.returns.map((r) => `#${r.number}`).join(", ")}
                </p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
