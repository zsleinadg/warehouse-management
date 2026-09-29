import bcrypt from "bcryptjs";

/** Node-only password helpers (bcryptjs). Token helpers live in tokens.ts (edge-safe). */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
