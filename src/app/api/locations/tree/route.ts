import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";
import { buildTree } from "@/lib/inventory-tree";

/** Full location tree (roots to leaves) with stocks at each node. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR", "VIEWER"]);
  if ("response" in auth) return auth.response;
  const locations = await prisma.location.findMany({
    where: { disabled: false },
    select: { id: true, name: true, parentId: true, position: true },
    orderBy: { position: "asc" },
  });

  const stocks = await prisma.stock.findMany({
    where: { location: { disabled: false }, material: { disabled: false } },
    select: {
      id: true,
      locationId: true,
      quantity: true,
      position: true,
      notes: true,
      needsReview: true,
      material: { select: { id: true, code: true, name: true, unit: true } },
    },
    orderBy: { position: "asc" },
  });

  return NextResponse.json({ data: buildTree(locations, stocks) });
}
