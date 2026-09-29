import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  generateRefreshToken,
  hashRefreshToken,
  refreshExpiresAt,
  setAuthCookies,
  signAccessToken,
} from "@/lib/tokens";

function revoked(response: NextResponse): NextResponse {
  clearAuthCookies(response);
  return response;
}

/**
 * Rotate the refresh token. Reuse of an already-rotated token means theft:
 * every session of the user is revoked.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const raw = request.cookies.get(REFRESH_COOKIE)?.value;
  if (!raw) {
    return revoked(
      NextResponse.json(
        { errors: [{ field: "refresh", message: "Not authenticated" }] },
        { status: 401 },
      ),
    );
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashRefreshToken(raw) },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      revokedAt: true,
      replacedBy: true,
      user: {
        select: { id: true, name: true, email: true, role: true, disabled: true },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    return revoked(
      NextResponse.json(
        { errors: [{ field: "refresh", message: "Session expired" }] },
        { status: 401 },
      ),
    );
  }

  // Token already rotated and presented again: possible theft, burn everything.
  if (session.replacedBy) {
    await prisma.session.updateMany({
      where: { userId: session.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return revoked(
      NextResponse.json(
        { errors: [{ field: "refresh", message: "Session reused" }] },
        { status: 401 },
      ),
    );
  }

  if (session.user.disabled) {
    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
      select: { id: true },
    });
    return revoked(
      NextResponse.json(
        { errors: [{ field: "refresh", message: "Not authenticated" }] },
        { status: 401 },
      ),
    );
  }

  const nextRefresh = generateRefreshToken();
  const created = await prisma.session.create({
    data: {
      userId: session.userId,
      tokenHash: hashRefreshToken(nextRefresh),
      expiresAt: refreshExpiresAt(),
    },
    select: { id: true },
  });
  await prisma.session.update({
    where: { id: session.id },
    data: { revokedAt: new Date(), replacedBy: created.id },
    select: { id: true },
  });

  const response = NextResponse.json({
    data: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role,
    },
  });
  setAuthCookies(
    response,
    await signAccessToken(session.user.id, session.user.role),
    nextRefresh,
  );
  return response;
}
