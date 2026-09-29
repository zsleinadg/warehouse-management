import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { comparePassword } from "@/lib/auth";
import {
  generateRefreshToken,
  hashRefreshToken,
  refreshExpiresAt,
  setAuthCookies,
  signAccessToken,
} from "@/lib/tokens";

const loginSchema = z.object({
  email: z.email("Invalid email").max(254),
  password: z.string().min(1, "Password is required").max(256),
});

/** Issue access + rotating refresh cookies. Raw refresh value never touches the DB. */
export async function POST(request: Request): Promise<NextResponse> {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join(".") || "body",
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    select: { id: true, name: true, email: true, password: true, role: true, disabled: true },
  });
  if (!user || user.disabled) {
    return NextResponse.json(
      { errors: [{ field: "email", message: "Invalid credentials" }] },
      { status: 401 },
    );
  }

  const ok = await comparePassword(parsed.data.password, user.password);
  if (!ok) {
    return NextResponse.json(
      { errors: [{ field: "email", message: "Invalid credentials" }] },
      { status: 401 },
    );
  }

  const refreshToken = generateRefreshToken();
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: refreshExpiresAt(),
    },
    select: { id: true },
  });

  const response = NextResponse.json({
    data: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
  setAuthCookies(
    response,
    await signAccessToken(user.id, user.role),
    refreshToken,
  );
  return response;
}
