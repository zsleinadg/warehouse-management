import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

const querySchema = z.object({
  type: z.enum(["INBOUND", "OUTBOUND", "TRANSFER", "ADJUSTMENT", "RETURN"]).optional(),
  materialCode: z.string().trim().max(64).optional(),
  nfNumber: z.string().trim().max(64).optional(),
  issueId: z.string().uuid("Invalid issue").optional(),
  take: z.coerce.number().int().min(1).max(500).default(100),
});

/** Audit trail: every stock change, newest first, with optional filters. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR", "VIEWER"]);
  if ("response" in auth) return auth.response;

  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json(
      {
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join(".") || "query",
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const movements = await prisma.movement.findMany({
    where: {
      type: parsed.data.type ?? undefined,
      nfNumber: parsed.data.nfNumber ?? undefined,
      issueId: parsed.data.issueId ?? undefined,
      material: parsed.data.materialCode
        ? { code: { contains: parsed.data.materialCode, mode: "insensitive" } }
        : undefined,
    },
    orderBy: { createdAt: "desc" },
    take: parsed.data.take,
    select: {
      id: true,
      type: true,
      quantity: true,
      destination: true,
      nfNumber: true,
      reason: true,
      issueId: true,
      returnId: true,
      createdAt: true,
      material: { select: { code: true, name: true, unit: true } },
      user: { select: { name: true } },
    },
  });

  return NextResponse.json({ data: movements });
}
