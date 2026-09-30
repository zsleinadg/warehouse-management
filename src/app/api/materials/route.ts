import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

const createSchema = z.object({
  code: z.string().trim().min(1, "Code is required").max(64),
  name: z.string().trim().min(1, "Name is required").max(200),
  unit: z.string().trim().min(1, "Unit is required").max(16).default("UN"),
  minStock: z.coerce.number().int().min(0).default(0),
  costCents: z.coerce.number().int().min(0).default(0),
  disabled: z.coerce.boolean().default(false),
});

function invalid(issues: { field: string; message: string }[], status: number) {
  return NextResponse.json({ errors: issues }, { status });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR", "VIEWER"]);
  if ("response" in auth) return auth.response;

  const materials = await prisma.material.findMany({
    orderBy: { code: "asc" },
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

  return NextResponse.json({ data: materials });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR"]);
  if ("response" in auth) return auth.response;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
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
    where: { code: parsed.data.code },
    select: { id: true, name: true },
  });
  if (existing) {
    return invalid(
      [{ field: "code", message: `Code "${parsed.data.code}" already exists` }],
      409,
    );
  }

  const material = await prisma.material.create({
    data: {
      code: parsed.data.code,
      name: parsed.data.name,
      unit: parsed.data.unit,
      minStock: parsed.data.minStock,
      costCents: parsed.data.costCents,
      disabled: parsed.data.disabled,
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

  return NextResponse.json({ data: material }, { status: 201 });
}