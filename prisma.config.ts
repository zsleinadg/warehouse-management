import { config } from "dotenv";

// Prisma CLI does not auto-load env files: .env.local first, .env as fallback.
config({ path: ".env.local" });
config({ path: ".env" });

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
