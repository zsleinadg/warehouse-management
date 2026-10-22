import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

const cancelSchema = z.object({
  reason: z.string().trim().min(1, "Motivo é obrigatório").max(500),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorize(request, ["ADMIN", "OPERATOR"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;

  const existingCount = await prisma.stockCount.findUnique({
    where: { id },
  });

  if (!existingCount) {
    return NextResponse.json({ error: "Contagem não encontrada" }, { status: 404 });
  }

  if (existingCount.status === "APPLIED") {
    return NextResponse.json(
      { error: "Contagem já aplicada não pode ser cancelada" },
      { status: 400 }
    );
  }

  if (existingCount.status === "CANCELLED") {
    return NextResponse.json(
      { error: "Contagem já cancelada" },
      { status: 400 }
    );
  }

  // Non-admin users can only cancel their own counts
  if (auth.user.role !== "ADMIN" && existingCount.userId !== auth.user.userId) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = cancelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) },
        { status: 400 }
      );
    }

    await prisma.stockCount.update({
      where: { id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledBy: auth.user.userId,
        reason: `${existingCount.reason} | CANCELADO: ${parsed.data.reason}`,
      },
    });

    return NextResponse.json({ message: "Contagem cancelada" });
  } catch (error) {
    console.error("Error cancelling count:", error);
    return NextResponse.json({ error: "Erro ao cancelar contagem" }, { status: 500 });
  }
}