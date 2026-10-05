"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatCents } from "@/lib/api-client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Package, 
  MapPin, 
  Boxes, 
  DollarSign, 
  ClipboardList, 
  AlertTriangle,
  ArrowUpRight
} from "lucide-react";

interface DashboardData {
  materialsCount: number;
  locationsCount: number;
  openIssues: number;
  totalQuantity: number;
  valuationCents: number;
  lowStockCount: number;
  lowStock: {
    code: string;
    name: string;
    unit: string;
    quantity: number;
    minStock: number;
  }[];
  recentMovements: {
    id: string;
    type: string;
    quantity: number;
    destination: string | null;
    nfNumber: string | null;
    createdAt: string;
    material: { code: string; name: string };
    user: { name: string } | null;
  }[];
  recentActivity: {
    key: string;
    group: "ISSUE" | "INBOUND" | "SOLO";
    title: string;
    subtitle: string;
    issueId: string | null;
    nfNumber: string | null;
    createdAt: string;
    user: { name: string } | null;
    totalQuantity: number;
    items: { code: string; name: string; quantity: number; location: string | null; createdAt: string }[];
  }[];
}

async function fetchDashboard(): Promise<DashboardData> {
  const response = await fetch("/api/dashboard");
  if (!response.ok) throw new Error("Failed to load dashboard");
  const body = await response.json();
  return body.data;
}

const STAT_CARDS = [
  { label: "Materiais ativos", icon: Package, href: "/materiais", color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400" },
  { label: "Localizações", icon: MapPin, href: "/locais", color: "text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400" },
  { label: "Unidades em estoque", icon: Boxes, href: "/estoque", color: "text-purple-600 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400" },
  { label: "Valorização total", icon: DollarSign, href: "/relatorios", color: "text-amber-600 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400" },
  { label: "Requisições em aberto", icon: ClipboardList, href: "/saidas", color: "text-orange-600 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400" },
  { label: "Abaixo do mínimo", icon: AlertTriangle, href: "#baixo-estoque", color: "text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400" },
] as const;

export default function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: fetchDashboard });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="mb-1 text-lg font-semibold">Dashboard</h2>
          <p className="text-sm text-muted-foreground">Visão geral do almoxarifado</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label={STAT_CARDS[0].label}
          value={String(data.materialsCount)}
          icon={STAT_CARDS[0].icon}
          color={STAT_CARDS[0].color}
          href={STAT_CARDS[0].href}
        />
        <StatCard
          label={STAT_CARDS[1].label}
          value={String(data.locationsCount)}
          icon={STAT_CARDS[1].icon}
          color={STAT_CARDS[1].color}
          href={STAT_CARDS[1].href}
        />
        <StatCard
          label={STAT_CARDS[2].label}
          value={String(data.totalQuantity)}
          icon={STAT_CARDS[2].icon}
          color={STAT_CARDS[2].color}
          href={STAT_CARDS[2].href}
        />
        <StatCard
          label={STAT_CARDS[3].label}
          value={formatCents(data.valuationCents)}
          icon={STAT_CARDS[3].icon}
          color={STAT_CARDS[3].color}
          href={STAT_CARDS[3].href}
        />
        <StatCard
          label={STAT_CARDS[4].label}
          value={String(data.openIssues)}
          icon={STAT_CARDS[4].icon}
          color={STAT_CARDS[4].color}
          href={STAT_CARDS[4].href}
        />
        <StatCard
          label={STAT_CARDS[5].label}
          value={String(data.lowStockCount)}
          icon={STAT_CARDS[5].icon}
          color={STAT_CARDS[5].color}
          href={STAT_CARDS[5].href}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="min-w-0 md:col-span-4">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-base sm:text-lg">Abaixo do estoque mínimo</CardTitle>
            <Badge variant={data.lowStockCount > 0 ? "destructive" : "success"}>
              {data.lowStockCount} itens
            </Badge>
          </CardHeader>
          <CardContent>
            {data.lowStock.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                Nenhum material abaixo do mínimo.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-muted/50">
                      <th className="text-left p-3 font-medium">Código</th>
                      <th className="text-left p-3 font-medium">Material</th>
                      <th className="text-left p-3 font-medium">Saldo</th>
                      <th className="text-left p-3 font-medium">Mínimo</th>
                      <th className="text-left p-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.lowStock.map((item) => (
                      <tr key={item.code} className="border-b border-muted/50 hover:bg-muted/50">
                        <td className="p-3 font-mono font-semibold text-primary whitespace-nowrap">{item.code}</td>
                        <td className="p-3 max-w-[220px] truncate" title={item.name}>{item.name}</td>
                        <td className="p-3 text-destructive font-medium whitespace-nowrap">{item.quantity} {item.unit}</td>
                        <td className="p-3 text-muted-foreground whitespace-nowrap">{item.minStock} {item.unit}</td>
                        <td className="p-3">
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Crítico
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 md:col-span-3">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-base sm:text-lg">Movimentações recentes</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/saidas">
                Ver todas <ArrowUpRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {(data.recentActivity ?? []).length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                Nenhuma movimentação registrada ainda.
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {(data.recentActivity ?? []).map((group) => {
                  const href =
                    group.group === "ISSUE" && group.issueId
                      ? `/saidas?id=${group.issueId}`
                      : group.group === "INBOUND" && group.nfNumber
                        ? `/entradas?nf=${encodeURIComponent(group.nfNumber)}`
                        : null;
                  const card = (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 p-3 rounded-lg border border-muted/50 hover:bg-muted/50 transition-colors">
                      <Badge
                        variant={group.group === "ISSUE" ? "destructive" : group.group === "INBOUND" ? "success" : "warning"}
                        className="shrink-0 text-xs"
                      >
                        {group.group === "ISSUE" ? "OT" : group.group === "INBOUND" ? "Entrada" : "Ajuste"}
                      </Badge>
                      <div className="flex-1 min-w-0 basis-40">
                        <p className="font-medium truncate">{group.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[group.subtitle, `${group.items.length} ${group.items.length === 1 ? "item" : "itens"}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {group.items.slice(0, 3).map((i) => `${i.code} ×${i.quantity}`).join(" · ")}
                          {group.items.length > 3 && ` · +${group.items.length - 3}`}
                        </p>
                      </div>
                      <div className="ml-auto shrink-0 text-right">
                        <p className="text-xs text-muted-foreground">
                          {new Date(group.createdAt).toLocaleDateString("pt-BR")}
                        </p>
                        <p className="text-xs text-muted-foreground">{group.user?.name ?? "—"}</p>
                      </div>
                    </div>
                  );
                  return href ? (
                    <Link key={group.key} href={href} className="block">
                      {card}
                    </Link>
                  ) : (
                    <div key={group.key}>{card}</div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  href,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  href: string;
}) {
  return (
    <Card className="relative overflow-hidden transition-all hover:shadow-md">
      <Link href={href} className="block">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className={cn("p-2 rounded-lg", color)}>
              <Icon className="h-5 w-5" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold mt-2 break-words">{value}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">{label}</p>
        </CardContent>
      </Link>
    </Card>
  );
}

function cn(...inputs: (string | undefined | null | false)[]) {
  return inputs.filter(Boolean).join(" ");
}