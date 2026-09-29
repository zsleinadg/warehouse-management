"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SearchResult } from "@/lib/warehouse";

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

interface SearchBoxProps {
  onJump: (locationId: string, code: string) => void;
}

export default function SearchBox({ onJump }: SearchBoxProps) {
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim(), 300);

  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    enabled: debounced.length >= 2,
    queryFn: async (): Promise<SearchResult[]> => {
      const response = await fetch(`/api/search?q=${encodeURIComponent(debounced)}`);
      if (!response.ok) return [];
      const body = await response.json();
      return body.data ?? [];
    },
  });

  const results = data ?? [];

  return (
    <div className="sticky top-0 z-10 bg-white pb-2.5 dark:bg-zinc-900">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por código ou nome…"
        className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-2.5 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-black"
      />
      {debounced.length >= 2 && (
        <div className="mt-1.5">
          {isFetching && results.length === 0 && (
            <p className="px-1 py-2 text-center text-[13px] text-zinc-500">Buscando…</p>
          )}
          {!isFetching && results.length === 0 && (
            <p className="px-1 py-2 text-center text-[13px] text-zinc-500">
              Nenhum item encontrado.
            </p>
          )}
          {results.flatMap((item) =>
            item.locations.map((loc) => (
              <button
                key={`${item.code}-${loc.locationId}`}
                onClick={() => {
                  onJump(loc.locationId, item.code);
                  setQuery("");
                }}
                className="mb-1 block w-full rounded-md border border-zinc-200 px-2 py-1.5 text-left text-[13px] hover:bg-sky-100 dark:border-zinc-700 dark:hover:bg-sky-950"
              >
                <span className="font-mono font-semibold text-sky-800 dark:text-sky-300">
                  {item.code}
                </span>{" "}
                {item.name}
                {loc.needsReview && (
                  <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                    revisar
                  </span>
                )}
                <span className="block text-[11px] text-zinc-500">
                  {loc.path.join(" → ")} · qtd {loc.quantity}
                </span>
              </button>
            )),
          )}
        </div>
      )}
    </div>
  );
}
