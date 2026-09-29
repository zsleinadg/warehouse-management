import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ACCESS_COOKIE, verifyAccessToken } from "@/lib/tokens";

/** Current session user (for role-aware UI). */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  const claims = token ? await verifyAccessToken(token) : null;
  if (!claims) {
    return NextResponse.json(
      { errors: [{ field: "auth", message: "Not authenticated" }] },
      { status: 401 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: { id: true, name: true, email: true, role: true, disabled: true },
  });
  if (!user || user.disabled) {
    return NextResponse.json(
      { errors: [{ field: "auth", message: "Not authenticated" }] },
      { status: 401 },
    );
  }

  return NextResponse.json({
    data: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}
