import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, verifyAccessToken } from "./src/lib/tokens";

/**
 * Edge guard: /login redirects home when already authenticated, every
 * other page needs a valid access token (else /login), every API route
 * except /api/auth/* needs one too (else 401 JSON).
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  const claims = token ? await verifyAccessToken(token) : null;

  if (pathname === "/login") {
    if (claims) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (!claims) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { errors: [{ field: "auth", message: "Not authenticated" }] },
        { status: 401 },
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth).*)"],
};
