import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorize(request, ["ADMIN"]); // Only ADMIN can apply
  if ("response" in auth) return auth.response;

  const { id } = await params;

  const existingCount = await prisma.stockCount.findUnique({
    where: { id },
    include: {
      items: {
        include: { material: { select: { id: true, code: true } } },
      },
    },
  });

  if (!existingCount) {
    return NextResponse.json({ error: "Contagem não encontrada" }, { status: 404 });
  }

  if (existingCount.status !== "COUNTED") {
    return NextResponse.json(
      { error: "Contagem deve estar em status CONTADA para aplicar" },
      { status: 400 }
    );
  }

  // Check if all items have countedQuantity
  const incompleteItems = existingCount.items.filter((item) => item.countedQuantity === null);
  if (incompleteItems.length > 0) {
    return NextResponse.json(
      { error: `${incompleteItems.length} item(ns) não têm quantidade contada` },
      { status: 400 }
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const item of existingCount.items) {
        const difference = item.countedQuantity! - item.systemQuantity;

        if (difference !== 0) {
          // Update stock quantity
          if (existingCount.locationId) {
            // If count was by location, update that specific location's stock
            await tx.stock.upsert({
              where: { materialId_locationId: { materialId: item.materialId, locationId: existingCount.locationId! } },
              update: { quantity: { increment: difference } },
              create: { materialId: item.materialId, locationId: existingCount.locationId!, quantity: item.countedQuantity! },
            });
          } else {
            // If count was by materials (no specific location), we need to decide where to apply
            // For simplicity, apply to the location with the most stock or first location
            const mainStock = await tx.stock.findFirst({
              where: { materialId: item.materialId, quantity: { gt: 0 } },
              orderBy: { quantity: "desc" },
            });
            if (mainStock) {
              await tx.stock.update({
                where: { id: mainStock.id },
                data: { quantity: { increment: difference } },
              });
            } else {
              // No existing stock, create in first available location
              const firstLocation = await tx.location.findFirst({ where: { disabled: false } });
              if (firstLocation) {
                await tx.stock.create({
                  data: { materialId: item.materialId, locationId: firstLocation.id, quantity: item.countedQuantity! },
                });
              }
            }
          }

          // Create ADJUSTMENT movement
          await tx.movement.create({
            data: {
              type: "ADJUSTMENT",
              quantity: difference,
              materialId: item.materialId,
              locationId: existingCount.locationId,
              countId: id,
              userId: auth.user.userId,
              reason: `Ajuste por contagem #${existingCount.number}: ${existingCount.reason}`,
            },
          });
        }
      }

      // Update count status to APPLIED
      await tx.stockCount.update({
        where: { id },
        data: {
          status: "APPLIED",
          appliedAt: new Date(),
          appliedBy: auth.user.userId,
        },
      });
    });

    return NextResponse.json({ message: "Contagem aplicada ao estoque com sucesso" });
  } catch (error) {
    console.error("Error applying count:", error);
    return NextResponse.json({ error: "Erro ao aplicar contagem ao estoque" }, { status: 500 });
  }
}