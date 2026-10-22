import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

const SHEETS_URL = process.env.GOOGLE_SHEETS_WEBAPP_URL;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR"]);
  if ("response" in auth) return auth.response;

  try {
    const { issueId } = await request.json();
    if (!issueId) {
      return NextResponse.json({ error: "issueId obrigatório" }, { status: 400 });
    }

    if (!SHEETS_URL) {
      console.error("GOOGLE_SHEETS_WEBAPP_URL não configurada");
      return NextResponse.json({ error: "Integração não configurada no servidor" }, { status: 500 });
    }

    // Buscar issue completa com itens, materiais e acréscimos
    const issue = await prisma.issue.findUnique({
      where: { id: issueId },
      include: {
        items: {
          include: {
            material: { select: { code: true, name: true } },
            additions: {
              include: { user: { select: { name: true } } },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    if (!issue) {
      return NextResponse.json({ error: "Requisição não encontrada" }, { status: 404 });
    }

    // Montar payload para o Apps Script
    const payload = {
      action: "sync_saida",
      issue: {
        id: issue.id,
        number: issue.number,
        ot: issue.ot,
        kind: issue.kind,
        nfNumber: issue.nfNumber,
        destination: issue.destination,
        foreman: issue.foreman,
        status: issue.status,
        notes: issue.notes,
        cancelReason: issue.cancelReason,
      },
      items: issue.items.map((item) => ({
        material: { code: item.material.code, name: item.material.name },
        quantity: item.quantity,
        fulfilledQuantity: item.fulfilledQuantity,
        isExtra: item.isExtra,
        additions: item.additions.map((a) => ({
          id: a.id,
          quantity: a.quantity,
          createdAt: a.createdAt.toISOString(),
          user: a.user ? { name: a.user.name } : null,
        })),
      })),
    };

    // Enviar para o Apps Script
    // Apps Script exige Content-Type: text/plain para evitar CORS preflight
    const resp = await fetch(SHEETS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });

    const result = await resp.json().catch(() => ({ status: "erro", message: "Resposta inválida do Apps Script" }));

    if (!resp.ok || result.status === "erro") {
      console.error("Falha ao sincronizar com Google Sheets:", result);
      return NextResponse.json(
        { error: "Falha na sincronização", details: result },
        { status: 502 },
      );
    }

    return NextResponse.json({ status: "sucesso", ...result });
  } catch (error) {
    console.error("Erro em /api/sync-sheets:", error);
    return NextResponse.json(
      { error: "Erro interno", message: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 },
    );
  }
}