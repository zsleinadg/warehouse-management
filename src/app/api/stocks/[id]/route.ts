import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

const paramsSchema = z.object({ id: z.uuid("Invalid stock") });
const moveSchema = z.object({
  position: z.coerce.number().int().min(0).optional(),
  locationId: z.string().uuid("Invalid location").optional(),
});

function invalid(issues: { field: string; message: string }[], status: number) {
  return NextResponse.json({ errors: issues }, { status });
}

function isWriteConflict(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "P2034";
}

/**
 * Renumerações concorrentes (drops/cliques encavalados) conflitam no banco
 * (P2034 TransactionWriteConflict). Rejeitar de primeira vira 500 à toa:
 * tenta de novo com backoff curto; só desiste com 409 tratável.
 */
async function withWriteRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isWriteConflict(err) || attempt === attempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, 60 * (attempt + 1)));
    }
  }
  throw lastError;
}

/** Move a stock within its location or to another location. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR"]);
  if ("response" in auth) return auth.response;

  const parsedParams = paramsSchema.safeParse(await params);
  const parsedBody = moveSchema.safeParse(await request.json().catch(() => null));
  if (!parsedParams.success || !parsedBody.success) {
    const issues = [
      ...(parsedParams.success
        ? []
        : parsedParams.error.issues.map((i) => ({
            field: `params.${i.path.join(".")}`,
            message: i.message,
          }))),
      ...(parsedBody.success
        ? []
        : parsedBody.error.issues.map((i) => ({
            field: i.path.join(".") || "body",
            message: i.message,
          }))),
    ];
    return invalid(issues, 400);
  }

  const { position: newPosition, locationId: newLocationId } = parsedBody.data;

  const stock = await prisma.stock.findUnique({
    where: { id: parsedParams.data.id },
    select: { id: true, locationId: true, position: true, materialId: true },
  });
  if (!stock) {
    return invalid([{ field: "id", message: "Stock not found" }], 404);
  }

  const sameLocation = !newLocationId || newLocationId === stock.locationId;

  if (sameLocation) {
    // Apenas reordenar dentro do mesmo local
    const siblings = await prisma.stock.findMany({
      where: { locationId: stock.locationId, id: { not: stock.id } },
      select: { id: true },
      orderBy: { position: "asc" },
    });
    const target = Math.min(newPosition ?? stock.position, siblings.length);
    const siblingIds = siblings.map((sibling) => sibling.id);
    const ordered = [
      ...siblingIds.slice(0, target),
      stock.id,
      ...siblingIds.slice(target),
    ];

    try {
      await withWriteRetry(() =>
        prisma.$transaction(
          ordered.map((id, position) =>
            prisma.stock.update({ where: { id }, data: { position } }),
          ),
        ),
      );
    } catch (err) {
      if (isWriteConflict(err)) {
        return invalid(
          [{ field: "position", message: "A ordem mudou agora mesmo — tente mover de novo" }],
          409,
        );
      }
      throw err;
    }
  } else {
    // Mover para outro local: deletar do antigo, criar no novo
    // Reposicionar irmãos no local antigo
    const oldSiblings = await prisma.stock.findMany({
      where: { locationId: stock.locationId, id: { not: stock.id } },
      select: { id: true },
      orderBy: { position: "asc" },
    });

    // Determinar posição no novo local
    const newSiblings = await prisma.stock.findMany({
      where: { locationId: newLocationId },
      select: { id: true },
      orderBy: { position: "asc" },
    });
    const targetPos = Math.min(newPosition ?? newSiblings.length, newSiblings.length);

    try {
      await withWriteRetry(() =>
        prisma.$transaction([
          // Remover do local antigo e reposicionar irmãos
          ...oldSiblings.map((sibling, idx) =>
            prisma.stock.update({ where: { id: sibling.id }, data: { position: idx } }),
          ),
          // Deletar o stock do local antigo
          prisma.stock.delete({ where: { id: stock.id } }),
          // Inserir no novo local na posição correta
          ...newSiblings.map((sibling, idx) =>
            prisma.stock.update({
              where: { id: sibling.id },
              data: { position: idx < targetPos ? idx : idx + 1 },
            }),
          ),
          prisma.stock.create({
            data: {
              id: stock.id,
              materialId: stock.materialId,
              locationId: newLocationId,
              position: targetPos,
            },
          }),
        ]),
      );
    } catch (err) {
      if (isWriteConflict(err)) {
        return invalid(
          [{ field: "locationId", message: "A ordem mudou agora mesmo — tente mover de novo" }],
          409,
        );
      }
      throw err;
    }
  }

  const moved = await prisma.stock.findUnique({
    where: { id: stock.id },
    select: {
      id: true,
      quantity: true,
      position: true,
      locationId: true,
      material: { select: { code: true, name: true } },
    },
  });

  return NextResponse.json({ data: moved });
}

/** Remove a placement (the material itself stays in the catalog). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR"]);
  if ("response" in auth) return auth.response;

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return invalid(
      parsed.error.issues.map((i) => ({
        field: `params.${i.path.join(".")}`,
        message: i.message,
      })),
      400,
    );
  }

  const stock = await prisma.stock.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, locationId: true },
  });
  if (!stock) {
    return invalid([{ field: "id", message: "Stock not found" }], 404);
  }

  await prisma.stock.delete({ where: { id: stock.id } });

  const siblings = await prisma.stock.findMany({
    where: { locationId: stock.locationId },
    select: { id: true },
    orderBy: { position: "asc" },
  });
  try {
    await withWriteRetry(() =>
      prisma.$transaction(
        siblings.map((sibling, position) =>
          prisma.stock.update({ where: { id: sibling.id }, data: { position } }),
        ),
      ),
    );
  } catch (err) {
    if (isWriteConflict(err)) {
      return invalid(
        [{ field: "id", message: "A ordem mudou agora mesmo — tente de novo" }],
        409,
      );
    }
    throw err;
  }

  return NextResponse.json({ data: { ok: true } });
}
