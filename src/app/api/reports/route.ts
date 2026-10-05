import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

const querySchema = z.object({
  ot: z.string().uuid("Invalid OT").optional(),
  kind: z.enum(["OBRA", "EMERGENCIAL"]).optional(),
  nfNumber: z.string().trim().max(64).optional(),
  materialId: z.string().uuid("Invalid material").optional(),
  dateFrom: z.coerce.date("Invalid date").optional(),
  dateTo: z.coerce.date("Invalid date").optional(),
});

/** Consumption report: aggregates OUTBOUND + RETURN movements per material, optionally filtered by OT, material, date range. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR", "VIEWER"]);
  if ("response" in auth) return auth.response;

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      {
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join(".") || "query",
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const where: Record<string, unknown> = {
    type: { in: ["OUTBOUND", "RETURN"] },
    material: parsed.data.materialId ? { id: parsed.data.materialId } : undefined,
  };

  // Movement has no issue relation (scalar issueId only): resolve ids first.
  if (parsed.data.ot) {
    where.issueId = parsed.data.ot;
  }
  if (parsed.data.kind) {
    const matching = await prisma.issue.findMany({
      where: {
        kind: parsed.data.kind,
        ...(parsed.data.ot ? { id: parsed.data.ot } : {}),
      },
      select: { id: true },
    });
    const ids = matching.map((i) => i.id);
    if (parsed.data.ot && !ids.includes(parsed.data.ot)) {
      return NextResponse.json({ data: [] });
    }
    where.issueId = parsed.data.ot ?? { in: ids };
  }
  if (parsed.data.nfNumber) {
    where.nfNumber = parsed.data.nfNumber;
  }

  if (parsed.data.dateFrom || parsed.data.dateTo) {
    const createdAt: Record<string, Date> = {};
    if (parsed.data.dateFrom) createdAt.gte = parsed.data.dateFrom;
    if (parsed.data.dateTo) createdAt.lte = parsed.data.dateTo;
    where.createdAt = createdAt;
  }

  const movements = await prisma.movement.findMany({
    where,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      type: true,
      quantity: true,
      destination: true,
      nfNumber: true,
      locationId: true,
      createdAt: true,
      issueId: true,
      material: { select: { id: true, code: true, name: true, unit: true, costCents: true } },
    },
  });

  const locationNameById = new Map(
    (
      await prisma.location.findMany({
        where: { id: { in: [...new Set(movements.map((m) => m.locationId).filter((id): id is string => id !== null))] } },
        select: { id: true, name: true },
      })
    ).map((l) => [l.id, l.name]),
  );

  const byMaterial = new Map<string, {
    code: string;
    name: string;
    unit: string;
    totalQuantity: number;
    totalCostCents: number;
    movementCount: number;
    movements: { type: string; quantity: number; destination: string | null; nfNumber: string | null; location: string | null; createdAt: string }[];
  }>();

  for (const m of movements) {
    const key = m.material.id;
    const entry = byMaterial.get(key) ?? {
      code: m.material.code,
      name: m.material.name,
      unit: m.material.unit,
      totalQuantity: 0,
      totalCostCents: 0,
      movementCount: 0,
      movements: [],
    };
    const sign = m.type === "RETURN" ? -1 : 1;
    entry.totalQuantity += sign * m.quantity;
    entry.totalCostCents += sign * m.quantity * m.material.costCents;
    entry.movementCount += 1;
    entry.movements.push({ type: m.type, quantity: m.quantity, destination: m.destination, nfNumber: m.nfNumber, location: m.locationId ? (locationNameById.get(m.locationId) ?? m.locationId) : null, createdAt: m.createdAt.toISOString() });
    byMaterial.set(key, entry);
  }

  return NextResponse.json({
    data: Array.from(byMaterial.values()).map((v) => ({
      materialCode: v.code,
      materialName: v.name,
      unit: v.unit,
      totalQuantity: v.totalQuantity,
      totalCostCents: v.totalCostCents,
      avgCostCents: v.totalQuantity > 0 ? Math.round(v.totalCostCents / v.totalQuantity) : 0,
      movements: v.movements,
    })),
  });
}