import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

const updateSchema = z.object({
  code: z.string().trim().min(1, "Code is required").max(64).optional(),
  name: z.string().trim().min(1, "Name is required").max(200).optional(),
  unit: z.string().trim().min(1, "Unit is required").max(16).optional(),
  minStock: z.coerce.number().int().min(0).optional(),
  costCents: z.coerce.number().int().min(0).optional(),
  disabled: z.coerce.boolean().optional(),
});

function invalid(issues: { field: string; message: string }[], status: number) {
  return NextResponse.json({ errors: issues }, { status });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return invalid(
      parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      })),
      400,
    );
  }

  const existing = await prisma.material.findUnique({
    where: { id },
    select: { code: true, name: true, unit: true, minStock: true, costCents: true, disabled: true, stocks: { select: { id: true } } },
  });
  if (!existing) {
    return invalid([{ field: "id", message: "Material not found" }], 404);
  }

  if (parsed.data.disabled === true && existing.stocks.length > 0) {
    return invalid(
      [
        {
          field: "disabled",
          message: `Cannot disable material with ${existing.stocks.length} stock(s). Remove stocks first.`,
        },
      ],
      409,
    );
  }

  const material = await prisma.material.update({
    where: { id },
    data: {
      code: parsed.data.code ?? existing.code,
      name: parsed.data.name ?? existing.name,
      unit: parsed.data.unit ?? existing.unit,
      minStock: parsed.data.minStock ?? existing.minStock,
      costCents: parsed.data.costCents ?? existing.costCents,
      disabled: parsed.data.disabled ?? existing.disabled,
    },
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      minStock: true,
      costCents: true,
      disabled: true,
    },
  });

  return NextResponse.json({ data: material });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const existing = await prisma.material.findUnique({
    where: { id },
    select: { id: true, code: true, name: true, stocks: { select: { id: true, locationId: true } } },
  });
  if (!existing) {
    return invalid([{ field: "id", message: "Material not found" }], 404);
  }

  if (existing.stocks.length > 0) {
    return invalid(
      [
        {
          field: "id",
          message: `Cannot delete material "${existing.code}" with ${existing.stocks.length} stock(s). Disable it instead.`,
        },
      ],
      409,
    );
  }

  await prisma.material.delete({
    where: { id },
  });

  return NextResponse.json({ data: { id: existing.id } });
}