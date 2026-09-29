import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { breadcrumbMap } from "@/lib/inventory-tree";

const querySchema = z.object({
  q: z.string().trim().min(2, "Search term needs at least 2 characters").max(100),
});

/** Search materials by code or name, with every stock location as a breadcrumb. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const parsed = querySchema.safeParse({
    q: request.nextUrl.searchParams.get("q") ?? "",
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join(".") || "q",
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const { q } = parsed.data;
  const materials = await prisma.material.findMany({
    where: {
      disabled: false,
      OR: [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      code: true,
      name: true,
      unit: true,
      minStock: true,
      stocks: {
        where: { location: { disabled: false } },
        select: {
          locationId: true,
          quantity: true,
          position: true,
          needsReview: true,
        },
        orderBy: { position: "asc" },
      },
    },
    orderBy: { code: "asc" },
    take: 50,
  });

  const locations = await prisma.location.findMany({
    where: { disabled: false },
    select: { id: true, name: true, parentId: true, position: true },
  });
  const paths = breadcrumbMap(locations);

  return NextResponse.json({
    data: materials.map((material) => ({
      code: material.code,
      name: material.name,
      unit: material.unit,
      minStock: material.minStock,
      totalQuantity: material.stocks.reduce((sum, s) => sum + s.quantity, 0),
      locations: material.stocks.map((stock) => ({
        locationId: stock.locationId,
        path: paths.get(stock.locationId) ?? [],
        quantity: stock.quantity,
        position: stock.position,
        needsReview: stock.needsReview,
      })),
    })),
  });
}
