import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";
import { recordMovement, removeStock, totalOnHand } from "@/lib/stock-ledger";

const actionSchema = z.object({
  action: z.enum(["close", "cancel"], "Action must be close or cancel"),
});

function invalid(issues: { field: string; message: string }[], status: number) {
  return NextResponse.json({ errors: issues }, { status });
}

/** Issue detail with requested vs fulfilled quantities per item. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const issue = await prisma.issue.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      ot: true,
      destination: true,
      foreman: true,
      notes: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { name: true } },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          quantity: true,
          fulfilledQuantity: true,
          material: { select: { id: true, code: true, name: true, unit: true } },
        },
      },
      returns: {
        select: { id: true, number: true, reason: true, createdAt: true },
      },
    },
  });
  if (!issue) {
    return invalid([{ field: "id", message: "Issue not found" }], 404);
  }

  return NextResponse.json({ data: issue });
}

/**
 * Close a draft issue: every item is fulfilled up to the available balance
 * (partial fulfillment allowed, remainder stays pending on the issue) and
 * OUTBOUND movements are recorded. Cancel voids untouched drafts only.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR"]);
  if ("response" in auth) return auth.response;

  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return invalid(
      parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      })),
      400,
    );
  }

  const { id } = await params;
  const issue = await prisma.issue.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      ot: true,
      destination: true,
      status: true,
      items: {
        select: { id: true, materialId: true, quantity: true, fulfilledQuantity: true },
      },
    },
  });
  if (!issue) {
    return invalid([{ field: "id", message: "Issue not found" }], 404);
  }
  if (issue.status !== "DRAFT") {
    return invalid(
      [{ field: "status", message: `Only draft issues can change, current status is ${issue.status}` }],
      409,
    );
  }

  if (parsed.data.action === "cancel") {
    const cancelled = await prisma.issue.update({
      where: { id },
      data: { status: "CANCELLED" },
      select: { id: true, number: true, status: true },
    });
    return NextResponse.json({ data: cancelled });
  }

  const pending = issue.items.filter((item) => item.fulfilledQuantity < item.quantity);
  const balances = await Promise.all(
    pending.map(async (item) => ({
      item,
      available: await totalOnHand(prisma, item.materialId),
    })),
  );
  if (balances.every(({ available }) => available <= 0)) {
    return NextResponse.json(
      {
        errors: [{ field: "items", message: "No balance available for any pending item" }],
        data: balances.map(({ item, available }) => ({
          materialId: item.materialId,
          requested: item.quantity - item.fulfilledQuantity,
          available,
        })),
      },
      { status: 409 },
    );
  }

  const closed = await prisma.$transaction(async (tx) => {
    for (const { item, available } of balances) {
      const missing = item.quantity - item.fulfilledQuantity;
      const fulfill = Math.min(missing, available);
      if (fulfill <= 0) continue;
      await removeStock(tx, { materialId: item.materialId, quantity: fulfill });
      await recordMovement(tx, {
        type: "OUTBOUND",
        quantity: fulfill,
        materialId: item.materialId,
        userId: auth.user.userId,
        destination: issue.ot ?? issue.destination,
        issueId: issue.id,
      });
      await tx.issueItem.update({
        where: { id: item.id },
        data: { fulfilledQuantity: { increment: fulfill } },
        select: { id: true },
      });
    }
    return tx.issue.update({
      where: { id },
      data: { status: "CLOSED" },
      select: {
        id: true,
        number: true,
        ot: true,
        destination: true,
        status: true,
        items: {
          select: {
            quantity: true,
            fulfilledQuantity: true,
            material: { select: { code: true, name: true, unit: true } },
          },
        },
      },
    });
  });

  return NextResponse.json({ data: closed });
}
