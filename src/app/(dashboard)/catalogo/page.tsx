"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiErrorMessage, safeJson } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormInput, FormSelect } from "@/components/ui/forms";
import { toast } from "sonner";

interface CatalogItem {
  id: string;
  code: string;
  plant: string;
  name: string;
  storageLocation: string;
  unit: string;
  inWarehouse: boolean;
  totalQuantity: number;
}

interface CatalogResponse {
  data: CatalogItem[];
  meta: { total: number; take: number; skip: number };
}

const TAKE = 50;

const PLANT_OPTIONS = [
  { value: "", label: "Todas as plantas" },
  { value: "BLCT", label: "BLCT" },
  { value: "BLCP", label: "BLCP" },
  { value: "BLCQ", label: "BLCQ" },
  { value: "BLCS", label: "BLCS" },
  { value: "BLCR", label: "BLCR" },
  { value: "BLAS", label: "BLAS" },
  { value: "BLAD", label: "BLAD" },
  { value: "BLAR", label: "BLAR" },
];

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

async function fetchCatalog(q: string, plant: string, page: number): Promise<CatalogResponse> {
  const params = new URLSearchParams({
    q,
    plant,
    take: String(TAKE),
    skip: String(page * TAKE),
  });
  const response = await fetch(`/api/catalog?${params.toString()}`);
  if (!response.ok) throw new Error(apiErrorMessage(await safeJson(response), "Failed to load catalog"));
  const body = (await safeJson(response)) as Partial<CatalogResponse>;
  return { data: body.data ?? [], meta: body.meta ?? { total: 0, take: TAKE, skip: page * TAKE } };
}

export default function CatalogoPage() {
  const [query, setQuery] = useState("");
  const [plant, setPlant] = useState("");
  const [page, setPage] = useState(0);
  const debounced = useDebounced(query.trim(), 300);

  function handleQueryChange(value: string): void {
    setQuery(value);
    setPage(0);
  }

  function handlePlantChange(value: string): void {
    setPlant(value);
    setPage(0);
  }

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ["catalog", debounced, plant, page],
    queryFn: () => fetchCatalog(debounced, plant, page),
  });

  useEffect(() => {
    if (isError) toast.error("Falha ao carregar o catálogo");
  }, [isError]);

  const items = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / TAKE));

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Catálogo</h2>

      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <FormInput
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              label="Busca"
              placeholder="Buscar por código ou nome…"
              autoComplete="off"
            />
            <FormSelect
              value={plant}
              onValueChange={handlePlantChange}
              label="Planta"
              options={PLANT_OPTIONS}
              placeholder="Todas as plantas"
            />
          </div>
        </CardContent>
      </Card>

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
                    <th className="text-left p-3 font-medium">UM</th>
                    <th className="text-left p-3 font-medium">Depósito</th>
                    <th className="text-left p-3 font-medium">Planta</th>
                    <th className="text-left p-3 font-medium">Estoque</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-muted/50 hover:bg-muted/50">
                      <td className="p-3 font-mono font-semibold text-primary">{item.code}</td>
                      <td className="p-3">{item.name}</td>
                      <td className="p-3">{item.unit}</td>
                      <td className="p-3">{item.storageLocation}</td>
                      <td className="p-3">{item.plant}</td>
                      <td className="p-3">
                        {item.inWarehouse ? (
                          <Badge variant="success">
                            Tem no estoque{item.totalQuantity > 0 ? ` · ${item.totalQuantity}` : ""}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Só catálogo</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {items.length === 0 && (
                <div className="p-6 text-center text-muted-foreground">
                  Nenhum item encontrado.
                </div>
              )}
            </div>
            <div className="flex items-center justify-between p-3 text-sm text-muted-foreground">
              <span>
                {total} {total === 1 ? "item" : "itens"}
                {isFetching ? " · atualizando…" : ""}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Anterior
                </Button>
                <span>
                  Página {page + 1} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
