import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorize(request, ["ADMIN", "OPERATOR", "VIEWER"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;

  const count = await prisma.stockCount.findUnique({
    where: { id },
    include: {
      location: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
      appliedByUser: { select: { id: true, name: true } },
      cancelledByUser: { select: { id: true, name: true } },
      items: {
        include: {
          material: { select: { id: true, code: true, name: true, unit: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!count) {
    return NextResponse.json({ error: "Contagem não encontrada" }, { status: 404 });
  }

  // Non-admin users can only see their own counts
  if (auth.user.role !== "ADMIN" && count.userId !== auth.user.userId) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  return NextResponse.json({ data: count });
}