import { JWTPayload, SignJWT, jwtVerify } from "jose";
import { NextResponse } from "next/server";

export const ACCESS_COOKIE = "warehouse_token";
export const REFRESH_COOKIE = "warehouse_refresh";
// Turno de trabalho: 12h corridas desde o login (JWT + maxAge do cookie
// seguem esta constante). Aparelhos são individuais, então sessão longa é OK.
export const ACCESS_TTL_SECONDS = 12 * 60 * 60;
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

function cookieSecure(): boolean {
  // Navegadores aceitam cookie `Secure` em localhost (origem confiável), mas
  // recusam em http://<ip-da-lan> — e aí o login "entra e volta", pois o
  // POST 200 tem o Set-Cookie descartado. Para produção servida via HTTPS,
  // mantenha o padrão seguro; para uso em rede local via HTTP, defina
  // COOKIE_SECURE=false no .env.local e refaça o build.
  if (process.env.COOKIE_SECURE === "false") return false;
  if (process.env.COOKIE_SECURE === "true") return true;
  return process.env.NODE_ENV === "production";
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: cookieSecure(),
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
