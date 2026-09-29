import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

const paramsSchema = z.object({ id: z.uuid("Invalid stock") });
const moveSchema = z.object({ position: z.coerce.number().int().min(0) });

function invalid(issues: { field: string; message: string }[], status: number) {
  return NextResponse.json({ errors: issues }, { status });
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

  await prisma.$transaction(
    ordered.map((id, position) =>
      prisma.stock.update({ where: { id }, data: { position } }),
    ),
  );

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
  await prisma.$transaction(
    siblings.map((sibling, position) =>
      prisma.stock.update({ where: { id: sibling.id }, data: { position } }),
    ),
  );

  return NextResponse.json({ data: { ok: true } });
}
