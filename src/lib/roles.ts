import { NextRequest, NextResponse } from "next/server";
import type { Role } from "../../prisma/generated/client";
import { ACCESS_COOKIE, verifyAccessToken } from "./tokens";

export interface RequestUser {
  userId: string;
  role: Role;
}

type AuthResult = { user: RequestUser } | { response: NextResponse };

/** Validate the access cookie and enforce one of the allowed roles. */
export async function authorize(
  request: NextRequest,
  roles: Role[],
): Promise<AuthResult> {
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  const claims = token ? await verifyAccessToken(token) : null;

  if (!claims) {
    return {
      response: NextResponse.json(
        { errors: [{ field: "auth", message: "Not authenticated" }] },
        { status: 401 },
      ),
    };
  }
  if (!roles.includes(claims.role as Role)) {
    return {
      response: NextResponse.json(
        { errors: [{ field: "role", message: "Forbidden" }] },
        { status: 403 },
      ),
    };
  }
  return { user: { userId: claims.userId, role: claims.role as Role } };
}
