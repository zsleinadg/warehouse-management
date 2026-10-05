import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";
import { isValidNewParent, subtreeStockCount } from "@/lib/locations";

const updateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120).optional(),
  parentId: z.string().uuid("Invalid parent ID").optional(),
  position: z.coerce.number().int().min(0).optional(),
  disabled: z.coerce.boolean().optional(),
});

function invalid(issues: { field: string; message: string }[], status: number) {
  return NextResponse.json({ errors: issues }, { status });
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
    const newParent = await prisma.location.findUnique({
      where: { id: parsed.data.parentId },
      select: { id: true, disabled: true },
    });
    if (!newParent || newParent.disabled) {
      return invalid(
        [{ field: "parentId", message: "New parent not found or disabled" }],
        404,
      );
    }
    if (!(await isValidNewParent(prisma, id, parsed.data.parentId))) {
      return invalid(
        [{ field: "parentId", message: "Cannot move here: itself or its own descendant (cycle)" }],
        409,
      );
    }
  }

  // Moving across parents without an explicit position appends at the end
  // of the new sibling list instead of keeping a colliding number.
  let position = parsed.data.position ?? existing.position;
  if (parsed.data.parentId && parsed.data.parentId !== existing.parentId && parsed.data.position === undefined) {
    position = await prisma.location.count({
      where: { parentId: parsed.data.parentId, disabled: false },
    });
  }

  const updated = await prisma.location.update({
    where: { id },
    data: {
      name: parsed.data.name ?? existing.name,
      parentId: parsed.data.parentId ?? existing.parentId,
      position,
      disabled: parsed.data.disabled ?? existing.disabled,
    },
    select: { id: true, name: true, parentId: true, position: true, disabled: true },
  });

  return NextResponse.json({ data: updated });
}

/** Delete an empty location. Anything with stock in itself or its subtree
 * is rejected with 409 so the operator transfers first — never cascade
 * stock away silently. Admins only. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const existing = await prisma.location.findUnique({
    where: { id },
    select: { id: true, name: true, disabled: true },
  });
  if (!existing) {
    return invalid([{ field: "id", message: "Location not found" }], 404);
  }

  const { own, descendants } = await subtreeStockCount(prisma, id);
  if (own + descendants > 0) {
    return invalid(
      [
        {
          field: "id",
          message: `Location "${existing.name}" holds ${own} placement(s) here and ${descendants} in its subtree. Transfer items first, then delete.`,
        },
      ],
      409,
    );
  }

  await prisma.location.delete({
    where: { id },
  });

  return NextResponse.json({ data: { id: existing.id } });
}
