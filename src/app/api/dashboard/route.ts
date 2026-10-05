import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

/** Dashboard aggregates: counts, valuation, low stock and recent activity. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR", "VIEWER"]);
  if ("response" in auth) return auth.response;

  const [materialsCount, locationsCount, openIssues, stocks, recentMovements] = await Promise.all([
    prisma.material.count({ where: { disabled: false } }),
    prisma.location.count({ where: { disabled: false } }),
    prisma.issue.count({ where: { status: "DRAFT" } }),
    prisma.stock.findMany({
      select: {
        quantity: true,
        material: {
          select: { id: true, code: true, name: true, unit: true, minStock: true, costCents: true },
        },
      },
    }),
    prisma.movement.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        type: true,
        quantity: true,
        destination: true,
        nfNumber: true,
        locationId: true,
        issueId: true,
        createdAt: true,
        material: { select: { code: true, name: true } },
        user: { select: { name: true } },
      },
    }),
  ]);

  const locationNameById = new Map(
    (
      await prisma.location.findMany({
        where: { id: { in: [...new Set(recentMovements.map((m) => m.locationId).filter((id): id is string => id !== null))] } },
        select: { id: true, name: true },
      })
    ).map((l) => [l.id, l.name]),
  );
  const issueById = new Map(
    (
      await prisma.issue.findMany({
        where: { id: { in: [...new Set(recentMovements.map((m) => m.issueId).filter((id): id is string => id !== null))] } },
        select: { id: true, number: true, ot: true, kind: true, destination: true },
      })
    ).map((i) => [i.id, i]),
  );

  interface ActivityItem {
    code: string;
    name: string;
    quantity: number;
    location: string | null;
    createdAt: string;
  }
  interface ActivityGroup {
    key: string;
    group: "ISSUE" | "INBOUND" | "SOLO";
    title: string;
    subtitle: string;
    issueId: string | null;
    nfNumber: string | null;
    createdAt: string;
    user: { name: string } | null;
    totalQuantity: number;
    items: ActivityItem[];
  }
  const groups = new Map<string, ActivityGroup>();
  for (const m of recentMovements) {
    const location = m.locationId ? (locationNameById.get(m.locationId) ?? null) : null;
    const item: ActivityItem = {
      code: m.material.code,
      name: m.material.name,
      quantity: m.quantity,
      location,
      createdAt: m.createdAt.toISOString(),
    };
    if (m.issueId) {
      const key = `issue:${m.issueId}`;
      let group = groups.get(key);
      if (!group) {
        const issue = issueById.get(m.issueId);
        const isReturn = m.type === "RETURN";
        group = {
          key,
          group: "ISSUE",
          title: isReturn ? `Retorno da OT #${issue?.number ?? "?"}` : `Saída da OT #${issue?.number ?? "?"}`,
          subtitle: [issue?.ot, issue?.destination].filter(Boolean).join(" · "),
          issueId: m.issueId,
          nfNumber: null,
          createdAt: item.createdAt,
          user: m.user,
          totalQuantity: 0,
          items: [],
        };
        groups.set(key, group);
      }
      group.items.push(item);
      group.totalQuantity += m.type === "RETURN" ? -m.quantity : m.quantity;
      if (item.createdAt > group.createdAt) {
        group.createdAt = item.createdAt;
        group.user = m.user ?? group.user;
      }
    } else if (m.type === "INBOUND" && m.nfNumber) {
      const key = `nf:${m.nfNumber}`;
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          group: "INBOUND",
          title: `Entrada NF ${m.nfNumber}`,
          subtitle: m.destination ?? "",
          issueId: null,
          nfNumber: m.nfNumber,
          createdAt: item.createdAt,
          user: m.user,
          totalQuantity: 0,
          items: [],
        };
        groups.set(key, group);
      }
      group.items.push(item);
      group.totalQuantity += m.quantity;
      if (item.createdAt > group.createdAt) {
        group.createdAt = item.createdAt;
        group.user = m.user ?? group.user;
      }
    } else {
      groups.set(`movement:${m.id}`, {
        key: `movement:${m.id}`,
        group: "SOLO",
        title: m.type === "ADJUSTMENT" ? "Ajuste de contagem" : m.type,
        subtitle: m.destination ?? "",
        issueId: null,
        nfNumber: m.nfNumber,
        createdAt: item.createdAt,
        user: m.user,
        totalQuantity: m.quantity,
        items: [item],
      });
    }
  }
  const recentActivity = [...groups.values()]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 10);

  const totals = new Map<string, { quantity: number; material: (typeof stocks)[number]["material"] }>();
  for (const stock of stocks) {
    const entry = totals.get(stock.material.id) ?? { quantity: 0, material: stock.material };
    entry.quantity += stock.quantity;
    totals.set(stock.material.id, entry);
  }

  let totalQuantity = 0;
  let valuationCents = 0;
  const lowStock = [];
  for (const { quantity, material } of totals.values()) {
    totalQuantity += quantity;
    valuationCents += quantity * material.costCents;
    if (material.minStock > 0 && quantity < material.minStock) {
      lowStock.push({
        code: material.code,
        name: material.name,
        unit: material.unit,
        quantity,
        minStock: material.minStock,
      });
    }
  }
  lowStock.sort((a, b) => a.quantity / Math.max(a.minStock, 1) - b.quantity / Math.max(b.minStock, 1));

  return NextResponse.json({
    data: {
      materialsCount,
      locationsCount,
      openIssues,
      totalQuantity,
      valuationCents,
      lowStockCount: lowStock.length,
      lowStock: lowStock.slice(0, 20),
      recentActivity,
    },
  });
}
