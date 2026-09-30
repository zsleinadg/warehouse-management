import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

const updateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120).optional(),
  parentId: z.string().uuid("Invalid parent ID").optional(),
  position: z.coerce.number().int().min(0).optional(),
  disabled: z.coerce.boolean().optional(),
});

function invalid(issues: { field: string; message: string }[], status: number) {
  return NextResponse.json({ errors: issues }, { status });
}

async function isDescendantOf(
  locationId: string,
  potentialAncestorId: string,
  db: typeof prisma,
): Promise<boolean> {
  let current = await db.location.findUnique({
    where: { id: locationId },
    select: { id: true, parentId: true },
  });
  while (current && current.parentId) {
    if (current.id === potentialAncestorId) return true;
    if (current.parentId === potentialAncestorId) return true;
    current = await db.location.findUnique({
      where: { id: current.parentId },
      select: { id: true, parentId: true },
    });
  }
  return false;
}

/** Rename/move a location with anti-cycle protection. Operators and admins only. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return invalid(
      parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      })),
      400,
    );
  }

  const existing = await prisma.location.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      parentId: true,
      position: true,
      disabled: true,
      stocks: { select: { id: true } },
    },
  });
  if (!existing) {
    return invalid([{ field: "id", message: "Location not found" }], 404);
  }

  if (parsed.data.disabled === true && existing.stocks.length > 0) {
    return invalid(
      [
        {
          field: "disabled",
          message: `Cannot disable location "${existing.name}" with ${existing.stocks.length} stock(s). Remove or transfer stocks first.`,
        },
      ],
      409,
    );
  }

  if (parsed.data.parentId && parsed.data.parentId !== existing.parentId) {
    const isDesc = await isDescendantOf(id, parsed.data.parentId, prisma);
    if (isDesc) {
      return invalid(
        [{ field: "parentId", message: "Cannot set parent: would create cyclic reference" }],
        409,
      );
    }
  }

  const updated = await prisma.location.update({
    where: { id },
    data: {
      name: parsed.data.name ?? existing.name,
      parentId: parsed.data.parentId ?? existing.parentId,
      position: parsed.data.position ?? existing.position,
      disabled: parsed.data.disabled ?? existing.disabled,
    },
    select: { id: true, name: true, parentId: true, position: true, disabled: true },
  });

  return NextResponse.json({ data: updated });
}

/** Delete a location (soft-delete when placements exist). Admins only. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const existing = await prisma.location.findUnique({
    where: { id },
    select: { id: true, name: true, disabled: true, stocks: { select: { id: true } } },
  });
  if (!existing) {
    return invalid([{ field: "id", message: "Location not found" }], 404);
  }

  if (existing.stocks.length > 0) {
    await prisma.location.update({
      where: { id },
      data: { disabled: true },
    });
    return NextResponse.json(
      { data: { id: existing.id, disabled: true }, message: "Location soft-deleted (disabled)" },
      { status: 200 },
    );
  }

  await prisma.location.delete({
    where: { id },
  });

  return NextResponse.json({ data: { id: existing.id } });
}
