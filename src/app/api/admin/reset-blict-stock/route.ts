import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

function getDefaultQty(unit: string): number {
  const u = unit.toUpperCase();
  if (["UN", "PC", "CX", "PÇ", "PEC", "PEÇA", "UND", "UNI", "UNID"].includes(u)) return 1000;
  if (["KG", "G", "M", "MM", "CM", "KM", "L", "ML", "M2", "M3", "MT", "MTS"].includes(u)) return 10000;
  return 1000;
}

export async function POST(request: NextRequest) {
  // const auth = await authorize(request, ["ADMIN"]);
  // if ("response" in auth) return auth.response;

  try {
    console.log("🔄 Iniciando reset de estoque BLCT...");

    // 1. Limpar tudo
    console.log("🗑️  Limpando estoque e movimentos...");
    await prisma.movement.deleteMany({});
    await prisma.stock.deleteMany({});
    console.log("✅ Estoque e movimentos limpos");

    // 2. Localização padrão única
    let defaultLoc = await prisma.location.findFirst({
      where: { name: "ESTOQUE GERAL" },
    });
    if (!defaultLoc) {
      defaultLoc = await prisma.location.create({
        data: { name: "ESTOQUE GERAL", position: 0 },
      });
    }
    console.log(`✅ Localização: ${defaultLoc.name} (${defaultLoc.id})`);

    // 3. Buscar catálogo BLCT
    const catalog = await prisma.catalogMaterial.findMany({
      where: { plant: "BLCT" },
      select: { code: true, name: true, unit: true },
    });
    console.log(`📦 ${catalog.length} itens BLCT no catálogo`);

    // 4. Sincronizar Materials (upsert por code)
    console.log("🔄 Sincronizando Materials...");
    for (const c of catalog) {
      await prisma.material.upsert({
        where: { code: c.code },
        create: { code: c.code, name: c.name, unit: c.unit || "UN", minStock: 0, costCents: 0 },
        update: { name: c.name, unit: c.unit || "UN" },
      });
    }
    console.log("✅ Materials sincronizados");

    // 5. Buscar Materials BLCT
    const materials = await prisma.material.findMany({
      where: { code: { in: catalog.map(c => c.code) } },
      select: { id: true, code: true, name: true, unit: true },
    });

    // 6. Criar Stock em batch
    console.log("📦 Criando registros de estoque...");
    const stockData = materials.map((m, i) => ({
      materialId: m.id,
      locationId: defaultLoc.id,
      quantity: getDefaultQty(m.unit),
      position: i,
    }));

    await prisma.stock.createMany({ data: stockData, skipDuplicates: true });
    console.log(`✅ ${stockData.length} registros de estoque criados`);

    // 7. Resumo
    const summary = materials.reduce((acc, m) => {
      const qty = getDefaultQty(m.unit);
      acc[m.unit] = (acc[m.unit] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // 8. Verificação final
    const totalStock = await prisma.stock.aggregate({
      _sum: { quantity: true },
      _count: true,
    });

    return NextResponse.json({
      success: true,
      message: "Reset BLCT concluído",
      stats: {
        catalogItems: catalog.length,
        materialsSynced: materials.length,
        stockRecords: stockData.length,
        totalQuantity: totalStock._sum.quantity,
        byUnit: summary,
        defaultLocation: defaultLoc.name,
      },
    });
  } catch (error) {
    console.error("❌ Erro no reset BLCT:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao resetar estoque BLCT", details: String(error) },
      { status: 500 }
    );
  }
}