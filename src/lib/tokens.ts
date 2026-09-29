import { JWTPayload, SignJWT, jwtVerify } from "jose";
import { NextResponse } from "next/server";

export const ACCESS_COOKIE = "warehouse_token";
export const REFRESH_COOKIE = "warehouse_refresh";
export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_DAYS = 30;

interface AccessClaims extends JWTPayload {
  role: string;
}

function authSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET missing or shorter than 32 characters");
  }
  return new TextEncoder().encode(secret);
}

/** Short-lived access token: sub = user id, role embedded for guards. */
export async function signAccessToken(
  userId: string,
  role: string,
): Promise<string> {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(authSecret());
}

/** Returns { userId, role } or null when missing/expired/forged. */
export async function verifyAccessToken(
  token: string,
): Promise<{ userId: string; role: string } | null> {
  try {
    const { payload } = await jwtVerify(token, authSecret());
    const claims = payload as AccessClaims;
    if (typeof payload.sub !== "string" || typeof claims.role !== "string") {
      return null;
    }
    return { userId: payload.sub, role: claims.role };
  } catch {
    return null;
  }
}

export function refreshExpiresAt(from = new Date()): Date {
  return new Date(from.getTime() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function setAuthCookies(
  response: NextResponse,
  accessToken: string,
  refreshToken: string,
): void {
  response.cookies.set(
    ACCESS_COOKIE,
    accessToken,
    cookieOptions(ACCESS_TTL_SECONDS),
  );
  response.cookies.set(
    REFRESH_COOKIE,
    refreshToken,
    cookieOptions(REFRESH_TTL_DAYS * 24 * 60 * 60),
  );
}

export function clearAuthCookies(response: NextResponse): void {
  response.cookies.set(ACCESS_COOKIE, "", cookieOptions(0));
  response.cookies.set(REFRESH_COOKIE, "", cookieOptions(0));
}
