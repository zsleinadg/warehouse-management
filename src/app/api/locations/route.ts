import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  parentId: z.string().uuid("Invalid parent ID").optional(),
  position: z.coerce.number().int().min(0).default(0),
  disabled: z.coerce.boolean().default(false),
});

function invalid(issues: { field: string; message: string }[], status: number) {
  return NextResponse.json({ errors: issues }, { status });
}

/** List locations (flat). Viewers and above. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR", "VIEWER"]);
  if ("response" in auth) return auth.response;

  const locations = await prisma.location.findMany({
    orderBy: { position: "asc" },
    select: { id: true, name: true, parentId: true, disabled: true },
  });

  return NextResponse.json({ data: locations });
}

/** Create a location, appending after siblings by default. Operators and admins only. */
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

  const { parentId, position, disabled } = parsed.data;
  let pos = position;
  if (pos === 0 || pos === undefined) {
    const siblings = await prisma.location.count({
      where: { parentId: parentId || undefined, disabled: false },
    });
    pos = siblings;
  }

  const created = await prisma.location.create({
    data: {
      name: parsed.data.name,
      parentId: parentId || undefined,
      position: pos,
      disabled: disabled || false,
    },
    select: { id: true, name: true, parentId: true, position: true, disabled: true },
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
