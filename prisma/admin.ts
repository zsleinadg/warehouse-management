import prisma from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth";

/**
 * Create (or refresh) the first ADMIN from env. Password is hashed with
 * bcrypt before storage and never logged; nothing is hardcoded here.
 *
 * Required: ADMIN_EMAIL, ADMIN_PASSWORD (min 12 chars).
 */
async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("ADMIN_EMAIL missing or invalid");
  }
  if (password.length < 12) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters");
  }

  const name = email.split("@")[0];
  const user = await prisma.user.upsert({
    where: { email },
    update: { password: await hashPassword(password), role: "ADMIN", disabled: false },
    create: {
      name,
      email,
      password: await hashPassword(password),
      role: "ADMIN",
    },
    select: { id: true, email: true, role: true },
  });

  console.log(`admin ready: ${user.email} (${user.role})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
