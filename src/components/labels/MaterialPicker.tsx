"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FormInput } from "@/components/ui/forms";
import { apiErrorMessage, safeJson } from "@/lib/api-client";

interface MaterialOption {
  id: string;
  code: string;
  name: string;
  unit: string;
}

async function searchMaterials(q: string): Promise<MaterialOption[]> {
  if (q.length < 2) return [];
  const params = new URLSearchParams({ q, take: "20" });
  const response = await fetch(`/api/materials?${params.toString()}`);
  if (!response.ok)
    throw new Error(apiErrorMessage(await safeJson(response), "Failed to search materials"));
  const body = (await safeJson(response)) as { data?: MaterialOption[] };
  return body.data ?? [];
}

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

interface MaterialPickerProps {
  value: string; // materialId selecionado
  onChange: (materialId: string, item: MaterialOption | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function MaterialPicker({
  value,
  onChange,
  disabled = false,
  placeholder = "Digite para buscar material…",
}: MaterialPickerProps) {
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [selectedItem, setSelectedItem] = useState<MaterialOption | null>(null);
  
  // Extract code from "CÓDIGO — NOME" format for searching
  const getSearchCode = (text: string) => text.split(" — ")[0].trim();
  
  const debounced = useDebounced(getSearchCode(searchText), 300);
  const lastMatchedRef = useRef<string>("");
  const lockedRef = useRef<string>("");
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Find the selected item by ID when value changes (from parent)
  const { data: allMaterials = [] } = useQuery({
    queryKey: ["all-materials"],
    queryFn: () => searchMaterials(""),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (value) {
      const match = allMaterials.find((m) => m.id === value);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync local state with prop changes
      setSelectedItem(match ?? null);
      // Show "CÓDIGO — NOME" in input when selected
      if (match) setSearchText(`${match.code} — ${match.name}`);
    } else {
      setSelectedItem(null);
      setSearchText("");
    }
  }, [value, allMaterials]);

  const { data: options = [], isFetching } = useQuery({
    queryKey: ["material-options", debounced],
    queryFn: () => searchMaterials(debounced),
    enabled: debounced.length >= 2 && open,
  });

  useEffect(() => {
    if (lockedRef.current !== "" && debounced === lockedRef.current) return;
    if (isFetching) return;
    if (debounced.length >= 2) {
      const match = options[0];
      const matchKey = `${debounced}-${match?.id ?? "none"}`;
      if (lastMatchedRef.current !== matchKey) {
        lastMatchedRef.current = matchKey;
        onChangeRef.current(debounced, match ?? null);
      }
    } else {
      lastMatchedRef.current = "";
    }
  }, [debounced, options, isFetching]);

  return (
    <div className="relative">
      <FormInput
        value={searchText}
        onChange={(e) => {
          const text = e.target.value;
          setSearchText(text);
          lockedRef.current = "";
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        disabled={disabled}
        label="Material"
        placeholder={placeholder}
        autoComplete="off"
      />
      {selectedItem && !open && (
        <div className="mt-1 text-sm text-muted-foreground flex items-center gap-2">
          <span className="font-mono text-primary">{selectedItem.code}</span>
          <span>{selectedItem.name}</span>
          <span className="text-zinc-400">({selectedItem.unit})</span>
        </div>
      )}
      {open && debounced.length >= 2 && options.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-card shadow-lg">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={() => {
                lastMatchedRef.current = `${o.id}`;
                lockedRef.current = o.code;
                setSearchText(`${o.code} — ${o.name}`);
                onChangeRef.current(o.id, o);
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
            >
              <span className="font-mono font-semibold text-primary">{o.code}</span>{" "}
              <span className="truncate">{o.name}</span>
              <span className="text-muted-foreground ml-2">({o.unit})</span>
            </button>
          ))}
          {options.length === 20 && (
            <div className="px-3 py-2 text-xs text-center text-muted-foreground">
              Mais resultados… refine a busca
            </div>
          )}
        </div>
      )}
      {open && debounced.length >= 2 && options.length === 0 && !isFetching && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-card shadow-lg">
          <div className="px-3 py-2 text-center text-muted-foreground">
            Nenhum material encontrado
          </div>
        </div>
      )}
    </div>
  );
}