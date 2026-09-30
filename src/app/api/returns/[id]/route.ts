import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

function invalid(issues: { field: string; message: string }[], status: number) {
  return NextResponse.json({ errors: issues }, { status });
}

/** Return detail with origin issue and received items. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const ret = await prisma.return.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      reason: true,
      createdAt: true,
      issue: { select: { id: true, number: true, ot: true, destination: true, foreman: true } },
      user: { select: { name: true } },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          quantity: true,
          material: { select: { id: true, code: true, name: true, unit: true } },
          location: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!ret) {
    return invalid([{ field: "id", message: "Return not found" }], 404);
  }

  return NextResponse.json({ data: ret });
}
