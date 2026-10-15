import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

/** Full detail of one count session, every counted line included. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR", "VIEWER"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const count = await prisma.stockCount.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      reason: true,
      createdAt: true,
      location: { select: { id: true, name: true } },
      user: { select: { name: true } },
      items: {
        select: {
          material: { select: { code: true, name: true, unit: true } },
          systemQuantity: true,
          countedQuantity: true,
          difference: true,
        },
        orderBy: { material: { code: "asc" } },
      },
    },
  });
  if (!count) {
    return NextResponse.json(
      { errors: [{ field: "id", message: "Count not found" }] },
      { status: 404 },
    );
  }

  return NextResponse.json({
    data: {
      ...count,
      createdAt: count.createdAt.toISOString(),
      divergenceCount: count.items.filter((item) => item.difference !== 0).length,
    },
  });
}
