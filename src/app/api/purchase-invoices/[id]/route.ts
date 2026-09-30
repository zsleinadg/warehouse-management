import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

function invalid(issues: { field: string; message: string }[], status: number) {
  return NextResponse.json({ errors: issues }, { status });
}

/**
 * Purchase invoice detail. Invoices are immutable: once posted, the lines,
 * stock effects and ledger rows are never edited or deleted through the API.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR"]);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const invoice = await prisma.purchaseInvoice.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      supplier: true,
      issuedAt: true,
      createdAt: true,
      lines: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          quantity: true,
          unitCostCents: true,
          material: { select: { id: true, code: true, name: true, unit: true } },
        },
      },
    },
  });
  if (!invoice) {
    return invalid([{ field: "id", message: "Purchase invoice not found" }], 404);
  }

  return NextResponse.json({
    data: {
      ...invoice,
      totalCostCents: invoice.lines.reduce(
        (sum, line) => sum + line.quantity * line.unitCostCents,
        0,
      ),
    },
  });
}
