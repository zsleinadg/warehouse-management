import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

const createSchema = z.object({
  locationId: z.string().uuid().optional(),
  materialIds: z.array(z.string().uuid()).optional(),
  reason: z.string().trim().min(1, "Motivo é obrigatório").max(500),
}).refine(
  (data) => data.locationId || (data.materialIds && data.materialIds.length > 0),
  { message: "Deve informar localização OU materiais", path: ["locationId"] }
);

export async function GET(request: NextRequest) {
  const auth = await authorize(request, ["ADMIN", "OPERATOR", "VIEWER"]);
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const userId = searchParams.get("userId");
  const page = parseInt(searchParams.get("page") || "1", 10);
  const take = parseInt(searchParams.get("take") || "20", 10);
  const skip = (page - 1) * take;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (userId) where.userId = userId;

  // Non-admin users only see their own counts unless they're filtering by status
  if (auth.user.role !== "ADMIN" && !status) {
    where.userId = auth.user.userId;
  }

  const [counts, total] = await Promise.all([
    prisma.stockCount.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: {
        location: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
        appliedByUser: { select: { id: true, name: true } },
        cancelledByUser: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
    }),
    prisma.stockCount.count({ where }),
  ]);

  return NextResponse.json({
    data: counts,
    page,
    take,
    total,
    totalPages: Math.ceil(total / take),
  });
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request, ["ADMIN", "OPERATOR"]);
  if ("response" in auth) return auth.response;

  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { errors: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) },
        { status: 400 }
      );
    }

    const { locationId, materialIds, reason } = parsed.data;

    let itemsToCount: { materialId: string; systemQuantity: number }[] = [];

    if (locationId) {
      // Get all materials with stock in this location
      const stocks = await prisma.stock.findMany({
        where: { locationId, quantity: { gt: 0 } },
        select: { materialId: true, quantity: true },
      });
      itemsToCount = stocks.map((s) => ({
        materialId: s.materialId,
        systemQuantity: Number(s.quantity),
      }));
    } else if (materialIds && materialIds.length > 0) {
      // materialIds podem ser Material.id, Material.code ou CatalogMaterial.id
      // Estratégia:
      // 1. Primeiro resolve todos os CatalogMaterial IDs para seus codes
      // 2. Busca Materials existentes por id, code ou pelos codes do catálogo
      // 3. Cria apenas os Materials que não existem

      const materialMap = new Map<string, string>(); // inputId -> Material.id

      // Passo 1: Busca Materials que coincidam diretamente com os IDs de entrada (Material.id ou Material.code)
      const directMaterials = await prisma.material.findMany({
        where: {
          OR: [
            { id: { in: materialIds } },
            { code: { in: materialIds } },
          ],
        },
        select: { id: true, code: true },
      });
      for (const m of directMaterials) {
        materialMap.set(m.id, m.id);
        materialMap.set(m.code, m.id);
      }

      // Passo 2: Para IDs não resolvidos, assume que são CatalogMaterial.id e busca seus codes
      const unresolvedIds = materialIds.filter((id) => !materialMap.has(id));
      if (unresolvedIds.length > 0) {
        const catalogMaterials = await prisma.catalogMaterial.findMany({
          where: { id: { in: unresolvedIds } },
          select: { id: true, code: true, name: true, unit: true },
        });

        // Extrai todos os codes do catálogo encontrados
        const catalogCodes = catalogMaterials.map((c) => c.code);

        // Passo 3: Busca Materials existentes por esses codes
        const existingMaterials = await prisma.material.findMany({
          where: { code: { in: catalogCodes } },
          select: { id: true, code: true },
        });
        for (const m of existingMaterials) {
          materialMap.set(m.code, m.id);
          // Também mapeia o CatalogMaterial.id para o Material.id
          const cat = catalogMaterials.find((c) => c.code === m.code);
          if (cat) materialMap.set(cat.id, m.id);
        }

        // Passo 4: Cria Materials para codes que não existem
        const existingCodes = new Set(existingMaterials.map((m) => m.code));
        const toCreate = catalogMaterials.filter((c) => !existingCodes.has(c.code));

        for (const cat of toCreate) {
          const newMaterial = await prisma.material.create({
            data: {
              code: cat.code,
              name: cat.name,
              unit: cat.unit || 'UN',
              minStock: 0,
              costCents: 0,
            },
            select: { id: true, code: true },
          });
          materialMap.set(cat.id, newMaterial.id);
          materialMap.set(newMaterial.code, newMaterial.id);
        }

        // Para os que já existiam, mapeia o CatalogMaterial.id
        for (const cat of catalogMaterials.filter((c) => existingCodes.has(c.code))) {
          const mat = existingMaterials.find((m) => m.code === cat.code);
          if (mat) materialMap.set(cat.id, mat.id);
        }
      }

      // Passo 5: Monta a lista final de items para contagem
      for (const inputId of materialIds) {
        const materialId = materialMap.get(inputId);
        if (!materialId) {
          console.log(`[POST /api/counts] Material não encontrado: ${inputId}`);
          continue;
        }
        const totalQty = await prisma.stock.aggregate({
          where: { materialId },
          _sum: { quantity: true },
        });
        const systemQty = Number(totalQty._sum.quantity ?? 0);
        itemsToCount.push({
          materialId,
          systemQuantity: systemQty,
        });
      }
    }

    if (itemsToCount.length === 0) {
      return NextResponse.json(
        { error: "Nenhum material válido encontrado para contagem" },
        { status: 400 }
      );
    }

    // Create count with items in PENDING status
    const count = await prisma.stockCount.create({
      data: {
        locationId: locationId || null,
        reason,
        userId: auth.user.userId,
        status: "PENDING",
        items: {
          create: itemsToCount.map((item) => ({
            materialId: item.materialId,
            systemQuantity: item.systemQuantity,
            countedQuantity: null,
            difference: null,
          })),
        },
      },
      include: {
        location: { select: { id: true, name: true } },
        items: {
          include: { material: { select: { id: true, code: true, name: true, unit: true } } },
        },
      },
    });

    return NextResponse.json({ data: count }, { status: 201 });
  } catch (error) {
    console.error("Error creating count:", error);
    return NextResponse.json({ error: "Erro ao criar contagem" }, { status: 500 });
  }
}