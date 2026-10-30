import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

/**
 * Limpa todos os issues e dados relacionados (apenas para ambiente de teste).
 * Remove: IssueItems, Issues, Movements vinculados a issues, Returns vinculados.
 */
export async function POST(request: NextRequest) {
  const auth = await authorize(request, ["ADMIN"]);
  if ("response" in auth) return auth.response;

  try {
    // Contar antes de deletar para retornar estatísticas
    const issuesCount = await prisma.issue.count();
    const issueItemsCount = await prisma.issueItem.count();
    const returnsCount = await prisma.return.count();
    const returnItemsCount = await prisma.returnItem.count();
    const movementsCount = await prisma.movement.count({
      where: { issueId: { not: null } },
    });

    // Deletar em ordem respeitando foreign keys
    await prisma.movement.deleteMany({
      where: { issueId: { not: null } },
    });
    await prisma.returnItem.deleteMany({});
    await prisma.return.deleteMany({});
    await prisma.issueItem.deleteMany({});
    await prisma.issue.deleteMany({});

    return NextResponse.json({
      success: true,
      message: "Dados de teste limpos com sucesso",
      deleted: {
        issues: issuesCount,
        issueItems: issueItemsCount,
        returns: returnsCount,
        returnItems: returnItemsCount,
        movements: movementsCount,
      },
    });
  } catch (error) {
    console.error("Erro ao limpar dados de teste:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao limpar dados de teste" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";