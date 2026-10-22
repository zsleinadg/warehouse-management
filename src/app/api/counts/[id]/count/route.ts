import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

const countItemSchema = z.object({
  materialId: z.string().uuid(),
  countedQuantity: z.number().int().min(0),
});

const updateSchema = z.object({
  items: z.array(countItemSchema).min(1, "Pelo menos um item é obrigatório"),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorize(request, ["ADMIN", "OPERATOR"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;

  // Check if count exists and is in PENDING status
  const existingCount = await prisma.stockCount.findUnique({
    where: { id },
    include: { items: { select: { materialId: true, systemQuantity: true } } },
  });

  if (!existingCount) {
    return NextResponse.json({ error: "Contagem não encontrada" }, { status: 404 });
  }

  if (existingCount.status !== "PENDING") {
    return NextResponse.json(
      { error: "Contagem não está em status PENDENTE" },
      { status: 400 }
    );
  }

  // Non-admin users can only update their own counts
  if (auth.user.role !== "ADMIN" && existingCount.userId !== auth.user.userId) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) },
        { status: 400 }
      );
    }

    const { items } = parsed.data;

    // Validate that all materialIds belong to this count
    const validMaterialIds = new Set(existingCount.items.map((i) => i.materialId));
    for (const item of items) {
      if (!validMaterialIds.has(item.materialId)) {
        return NextResponse.json(
          { error: `Material ${item.materialId} não pertence a esta contagem` },
          { status: 400 }
        );
      }
    }

    // Update count items with counted quantities and calculate differences
    await prisma.$transaction(
      items.map((item) => {
        const existingItem = existingCount.items.find((i) => i.materialId === item.materialId);
        const systemQuantity = existingItem?.systemQuantity ?? 0;
        return prisma.stockCountItem.update({
          where: { countId_materialId: { countId: id, materialId: item.materialId } },
          data: {
            countedQuantity: item.countedQuantity,
            difference: item.countedQuantity - systemQuantity,
          },
        });
      })
    );

    // Update count status to COUNTED
    const updatedCount = await prisma.stockCount.update({
      where: { id },
      data: { status: "COUNTED" },
      include: {
        location: { select: { id: true, name: true } },
        items: {
          include: { material: { select: { id: true, code: true, name: true, unit: true } } },
        },
      },
    });

    return NextResponse.json({ data: updatedCount });
  } catch (error) {
    console.error("Error saving count:", error);
    return NextResponse.json({ error: "Erro ao salvar contagem" }, { status: 500 });
  }
}