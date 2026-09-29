import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { refreshExpiresAt } from "./tokens";

/** Node-only auth helpers (bcryptjs + node:crypto). Token helpers live in tokens.ts (edge-safe). */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Opaque refresh token (raw value travels only in the httpOnly cookie). */
export function generateRefreshToken(): string {
  return randomBytes(32).toString("hex");
}

/** SHA-256 of the refresh token: the only form ever stored (Session.tokenHash). */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export { refreshExpiresAt };
