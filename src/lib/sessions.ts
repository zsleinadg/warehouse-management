import type { PrismaClient } from "../../prisma/generated/client";

/** Revoked sessions are kept this long for theft investigation, then purged. */
export const REVOKED_RETENTION_DAYS = 30;

type SessionDelegate = Pick<PrismaClient, "session">;

/**
 * Delete sessions that can no longer be used: expired ones right away, and
 * revoked ones past the retention window. Scoped to a user when userId is
 * given (login/refresh path), global otherwise (scheduled purge).
 * Returns the number of deleted rows.
 */
export async function purgeSessions(db: SessionDelegate, userId?: string): Promise<number> {
  const now = new Date();
  const retentionCutoff = new Date(now.getTime() - REVOKED_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await db.session.deleteMany({
    where: {
      ...(userId ? { userId } : {}),
      OR: [{ expiresAt: { lt: now } }, { revokedAt: { lt: retentionCutoff } }],
    },
  });
  return result.count;
}
