"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCanEdit } from "@/hooks/use-me";
import { apiErrorMessage, safeJson } from "@/lib/api-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormInput, FormSelect, type FormSelectOption } from "@/components/ui/forms";
import { toast } from "sonner";

interface LocationNode {
  id: string;
  name: string;
  children: LocationNode[];
}

interface CatalogOption {
  id: string;
  code: string;
  name: string;
  plant: string;
}

async function fetchTree(): Promise<LocationNode[]> {
  const response = await fetch("/api/locations/tree");
  if (!response.ok) throw new Error("Failed to load locations");
  const body = await safeJson(response);
  return (body as { data?: LocationNode[] })?.data ?? [];
}

async function searchCatalog(q: string): Promise<CatalogOption[]> {
  const params = new URLSearchParams({ q, take: "8" });
  const response = await fetch(`/api/catalog?${params.toString()}`);
  if (!response.ok) throw new Error("Failed to search catalog");
  const body = await safeJson(response);
  return (body as { data?: CatalogOption[] })?.data ?? [];
}

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function flatten(nodes: LocationNode[], prefix: string[] = []): { id: string; path: string }[] {
  const out: { id: string; path: string }[] = [];
  for (const node of nodes) {
    const path = [...prefix, node.name];
    out.push({ id: node.id, path: path.join(" → ") });
    out.push(...flatten(node.children, path));
  }
  return out;
}

function preferBlct(options: CatalogOption[], code: string) {
  const exact = options.filter((o) => o.code === code);
  if (exact.length === 0) return null;
  return exact.find((o) => o.plant === "BLCT") ?? exact[0];
}

interface CatalogOption {
  id: string;
  code: string;
  name: string;
  plant: string;
}

interface MaterialRow {
  key: number;
  code: string;
  item: CatalogOption | null;
}

function CodePicker({ code, onChange }: { code: string; onChange: (code: string, item: CatalogOption | null) => void }) {
  const [open, setOpen] = useState(false);
  const debounced = useDebounced(code.trim(), 300);
  const lastMatchedRef = useRef<string>("");
  const lockedRef = useRef<string>("");
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const { data: options = [], isFetching } = useQuery({
    queryKey: ["catalog-options", debounced],
    queryFn: () => searchCatalog(debounced),
    enabled: debounced.length >= 2,
  });

  const deduped = options.reduce((acc: CatalogOption[], o) => {
    if (acc.some((a) => a.code === o.code)) return acc;
    acc.push(preferBlct(options, o.code) ?? o);
    return acc;
  }, []);

  useEffect(() => {
    if (lockedRef.current !== "" && debounced === lockedRef.current) return;
    if (isFetching) return;
    if (debounced.length >= 2) {
      const match = preferBlct(options, debounced);
      const matchKey = `${debounced}-${match?.id ?? "none"}`;
      if (lastMatchedRef.current !== matchKey) {
        lastMatchedRef.current = matchKey;
        onChangeRef.current(debounced, match);
      }
    } else {
      lastMatchedRef.current = "";
    }
  }, [debounced, options, isFetching]);

  return (
    <div className="relative">
      <FormInput
        value={code}
        onChange={(e) => {
          lockedRef.current = "";
          onChange(e.target.value, null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        label="Código do material"
        placeholder="Digite o código…"
        autoComplete="off"
      />
      {open && debounced.length >= 2 && deduped.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-card shadow-lg">
          {deduped.map((o) => (
            <button
              key={o.code}
              type="button"
              onMouseDown={() => {
                lastMatchedRef.current = `${o.code}-${o.id}`;
                lockedRef.current = o.code;
                onChangeRef.current(o.code, o);
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <span className="font-mono font-semibold text-primary">{o.code}</span>{" "}
              <span className="truncate">{o.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function NewCountTab({ onCountCreated }: { onCountCreated: () => void }) {
  const queryClient = useQueryClient();
  const canEdit = useCanEdit();
  const [mode, setMode] = useState<"location" | "materials">("location");
  const [locationId, setLocationId] = useState("");
  const [reason, setReason] = useState("");
  const [items, setItems] = useState<MaterialRow[]>([{ key: 0, code: "", item: null }]);
  const [nextKey, setNextKey] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: tree = [] } = useQuery({ queryKey: ["tree"], queryFn: fetchTree });
  const locationOptions: FormSelectOption[] = useMemo(
    () => flatten(tree).map((o) => ({ value: o.id, label: o.path })),
    [tree]
  );

  const addRow = useCallback(() => {
    setItems((prev) => [...prev, { key: nextKey, code: "", item: null }]);
    setNextKey((k) => k + 1);
  }, [nextKey]);

  const removeRow = useCallback((key: number) => {
    setItems((prev) => prev.filter((r) => r.key !== key));
  }, []);

  const updateRow = useCallback((key: number, code: string, item: CatalogOption | null) => {
    setItems((prev) => prev.map((r) => (r.key === key ? { ...r, code, item } : r)));
  }, []);

  const validItems = items.filter((r) => r.item !== null);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      toast.error("Informe o motivo da contagem");
      return;
    }

    if (mode === "location" && !locationId) {
      toast.error("Selecione uma localização");
      return;
    }

    if (mode === "materials" && validItems.length === 0) {
      toast.error("Adicione pelo menos um material");
      return;
    }

    setIsSubmitting(true);
    try {
      const body: Record<string, unknown> = { reason };
      if (mode === "location") {
        body.locationId = locationId;
      } else {
        body.materialIds = validItems.map((r) => r.item!.id);
      }

      const response = await fetch("/api/counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.errors?.[0]?.message || "Erro ao criar contagem");
      }

      toast.success("Contagem criada com sucesso!");
      onCountCreated();
      // Reset form
      setReason("");
      setLocationId("");
      setItems([{ key: 0, code: "", item: null }]);
      setNextKey(1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao criar contagem");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canEdit) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Sem permissão para criar contagens.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>Nova Contagem</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="count-mode"
              value="location"
              checked={mode === "location"}
              onChange={() => setMode("location")}
              className="h-4 w-4 accent-primary"
            />
            <span>Por Localização</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="count-mode"
              value="materials"
              checked={mode === "materials"}
              onChange={() => setMode("materials")}
              className="h-4 w-4 accent-primary"
            />
            <span>Por Materiais</span>
          </label>
        </div>

        {mode === "location" && (
          <FormSelect
            value={locationId}
            onValueChange={setLocationId}
            label="Localização"
            placeholder="Selecione a localização…"
            options={locationOptions}
            required={true}
          />
        )}

        {mode === "materials" && (
          <div className="space-y-3">
            {items.map((row) => (
              <div key={row.key} className="flex items-end gap-2">
                <div className="flex-1">
                  <CodePicker
                    code={row.code}
                    onChange={(code, item) => updateRow(row.key, code, item)}
                  />
                </div>
                {row.item == null && row.code.trim() !== "" && (
                  <span className="text-sm text-destructive shrink-0 mb-2">não encontrado</span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="mb-1 shrink-0 text-destructive hover:text-destructive"
                  onClick={() => removeRow(row.key)}
                  disabled={items.length === 1}
                >
                  Remover
                </Button>
              </div>
            ))}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={addRow}>
                Adicionar material
              </Button>
            </div>
          </div>
        )}

        <FormInput
          label="Motivo da contagem"
          placeholder="Ex.: inventário mensal, auditoria, etc."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required={true}
        />

        <Button
          className="w-full"
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Criando…" : "Criar Contagem"}
        </Button>
      </CardContent>
    </Card>
  );
}