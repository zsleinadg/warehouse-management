import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";
import { purgeSessions } from "@/lib/sessions";

function cronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Scheduled housekeeping for the Session table. Called by cron-job.org
 * (Bearer CRON_SECRET) or manually by an admin. Idempotent: running twice
 * in a row purges 0 the second time.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!cronAuthorized(request)) {
    const auth = await authorize(request, ["ADMIN"]);
    if ("response" in auth) return auth.response;
  }

  const purged = await purgeSessions(prisma);
  return NextResponse.json({ data: { purged, at: new Date().toISOString() } });
}
