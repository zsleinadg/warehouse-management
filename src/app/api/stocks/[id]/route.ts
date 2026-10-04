import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

const paramsSchema = z.object({ id: z.uuid("Invalid stock") });
const moveSchema = z.object({ position: z.coerce.number().int().min(0) });

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

/** Move a stock within its location, renumbering siblings in one transaction. */
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

  const stock = await prisma.stock.findUnique({
    where: { id: parsedParams.data.id },
    select: { id: true, locationId: true },
  });
  if (!stock) {
    return invalid([{ field: "id", message: "Stock not found" }], 404);
  }

  const siblings = await prisma.stock.findMany({
    where: { locationId: stock.locationId, id: { not: stock.id } },
    select: { id: true },
    orderBy: { position: "asc" },
  });

  const target = Math.min(parsedBody.data.position, siblings.length);
  const siblingIds = siblings.map((sibling) => sibling.id);
  const ordered = [...siblingIds.slice(0, target), stock.id, ...siblingIds.slice(target)];

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

  const moved = await prisma.stock.findUnique({
    where: { id: stock.id },
    select: {
      id: true,
      quantity: true,
      position: true,
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
