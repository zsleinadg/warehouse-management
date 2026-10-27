
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

const SHEETS_URL = process.env.GOOGLE_SHEETS_WEBAPP_URL;

/**
 * Formata uma data como DD/MM/AAAA, sem horário.
 * Usa os componentes locais quando recebe um objeto Date.
 */
function formatDateBR(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);

  if (Number.isNaN(d.getTime())) {
    throw new Error(`Data inválida: ${String(date)}`);
  }

  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();

  return `${day}/${month}/${year}`;
}

export async function POST(
  request: NextRequest
): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR"]);

  if ("response" in auth) {
    return auth.response;
  }

  try {
    const body = await request.json();
    const issueId = body?.issueId;

    if (!issueId) {
      return NextResponse.json(
        { error: "issueId obrigatório" },
        { status: 400 }
      );
    }

    if (!SHEETS_URL) {
      console.error(
        "GOOGLE_SHEETS_WEBAPP_URL não configurada"
      );

      return NextResponse.json(
        { error: "Integração não configurada no servidor" },
        { status: 500 }
      );
    }

    // Buscar requisição completa com itens, materiais e acréscimos.
    const issue = await prisma.issue.findUnique({
      where: { id: issueId },
      include: {
        items: {
          include: {
            material: {
              select: {
                code: true,
                name: true,
                unit: true,
              },
            },
            additions: {
              include: {
                user: {
                  select: { name: true },
                },
              },
              orderBy: {
                createdAt: "asc",
              },
            },
          },
        },
      },
    });

    if (!issue) {
      return NextResponse.json(
        { error: "Requisição não encontrada" },
        { status: 404 }
      );
    }

    // Montar payload para o Apps Script.
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
        createdAt: formatDateBR(issue.createdAt),
      },
      items: issue.items.map((item) => ({
        material: {
          code: item.material.code,
          name: item.material.name,
          unit: item.material.unit,
        },
        quantity: item.quantity,
        fulfilledQuantity: item.fulfilledQuantity,
        isExtra: item.isExtra,
        additions: item.additions.map((addition) => ({
          id: addition.id,
          quantity: addition.quantity,
          nfNumber: addition.nfNumber ?? undefined,
          createdAt: formatDateBR(addition.createdAt),
          user: addition.user
            ? { name: addition.user.name }
            : null,
        })),
      })),
    };

    // Enviar ao Apps Script.
    // Mantém text/plain para evitar preflight CORS.
    const resp = await fetch(SHEETS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const responseText = await resp.text();

    let result: {
      status?: string;
      message?: string;
      [key: string]: unknown;
    };

    try {
      result = JSON.parse(responseText);
    } catch {
      console.error(
        "Resposta inválida do Apps Script:",
        responseText
      );

      return NextResponse.json(
        {
          error: "Resposta inválida do Google Sheets",
          details: responseText.slice(0, 500),
        },
        { status: 502 }
      );
    }

    if (!resp.ok || result.status === "erro") {
      console.error(
        "Falha ao sincronizar com Google Sheets:",
        result
      );

      return NextResponse.json(
        {
          error: "Falha na sincronização",
          details: result,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      status: "sucesso",
      ...result,
    });
  } catch (error) {
    console.error(
      "Erro em /api/sync-sheets:",
      error
    );

    return NextResponse.json(
      {
        error: "Erro interno",
        message:
          error instanceof Error
            ? error.message
            : "Erro desconhecido",
      },
      { status: 500 }
    );
  }
}
