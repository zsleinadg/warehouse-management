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
      take: 10,
      select: {
        id: true,
        type: true,
        quantity: true,
        destination: true,
        nfNumber: true,
        createdAt: true,
        material: { select: { code: true, name: true } },
        user: { select: { name: true } },
      },
    }),
  ]);

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
      recentMovements,
    },
  });
}
