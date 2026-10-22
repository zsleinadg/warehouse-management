"use client";

import { useState, Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NewCountTab } from "@/components/counts/NewCountTab";
import { CountTab } from "@/components/counts/CountTab";
import { ApplyTab } from "@/components/counts/ApplyTab";
import { HistoryTab } from "@/components/counts/HistoryTab";

export default function ContagemPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando…</p>}>
      <ContagemContent />
    </Suspense>
  );
}

function ContagemContent() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"nova" | "contar" | "aplicar" | "historico">("nova");

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["pending-counts"] });
    queryClient.invalidateQueries({ queryKey: ["counted-counts"] });
    queryClient.invalidateQueries({ queryKey: ["all-counts"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Contagem Cíclica</h2>

      <div className="mb-4 flex gap-2 flex-wrap">
        <Button variant={tab === "nova" ? "default" : "outline"} size="sm" onClick={() => setTab("nova")}>
          Nova Contagem
        </Button>
        <Button variant={tab === "contar" ? "default" : "outline"} size="sm" onClick={() => setTab("contar")}>
          Contar
        </Button>
        <Button variant={tab === "aplicar" ? "default" : "outline"} size="sm" onClick={() => setTab("aplicar")}>
          Aplicar
        </Button>
        <Button variant={tab === "historico" ? "default" : "outline"} size="sm" onClick={() => setTab("historico")}>
          Histórico
        </Button>
      </div>

      {tab === "nova" && <NewCountTab onCountCreated={invalidateAll} />}
      {tab === "contar" && <CountTab onCountSaved={invalidateAll} />}
      {tab === "aplicar" && <ApplyTab onCountApplied={invalidateAll} />}
      {tab === "historico" && <HistoryTab />}
    </div>
  );
}