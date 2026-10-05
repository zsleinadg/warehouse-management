import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { hashRefreshToken } from "@/lib/auth";
import {
  REFRESH_COOKIE,
  clearAuthCookies,
} from "@/lib/tokens";

/** Revoke the current session and clear cookies. Always succeeds. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const raw = request.cookies.get(REFRESH_COOKIE)?.value;
  if (raw) {
    await prisma.session.updateMany({
      where: { tokenHash: hashRefreshToken(raw), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  const response = NextResponse.json({ data: { ok: true } });
  clearAuthCookies(response);
  return response;
}
