import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

const querySchema = z.object({
  q: z.string().trim().max(100).default(""),
  plant: z.string().trim().max(16).default(""),
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

/**
 * Search the supplier catalog (source of truth for code/name lookups).
 * Every row is enriched with warehouse availability matched by code:
 * `inWarehouse` tells whether we hold it, `totalQuantity` how much.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR", "VIEWER"]);
  if ("response" in auth) return auth.response;

  const parsed = querySchema.safeParse({
    q: request.nextUrl.searchParams.get("q") ?? "",
    plant: request.nextUrl.searchParams.get("plant") ?? "",
    take: request.nextUrl.searchParams.get("take") ?? undefined,
    skip: request.nextUrl.searchParams.get("skip") ?? undefined,
  });
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

  const { q, plant, take, skip } = parsed.data;
  const where = {
    ...(plant ? { plant } : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.catalogMaterial.count({ where }),
    prisma.catalogMaterial.findMany({
      where,
      select: {
        id: true,
        code: true,
        plant: true,
        name: true,
        storageLocation: true,
        unit: true,
      },
      orderBy: { code: "asc" },
      take,
      skip,
    }),
  ]);

  const holdings = await prisma.material.findMany({
    where: { code: { in: rows.map((row) => row.code) } },
    select: {
      code: true,
      stocks: { select: { quantity: true } },
    },
  });
  const onHand = new Map(
    holdings.map((material) => [
      material.code,
      material.stocks.reduce((sum, stock) => sum + stock.quantity, 0),
    ]),
  );

  return NextResponse.json({
    data: rows.map((row) => {
      const totalQuantity = onHand.get(row.code) ?? 0;
      return {
        ...row,
        inWarehouse: onHand.has(row.code),
        totalQuantity,
      };
    }),
    meta: { total, take, skip },
  });
}
