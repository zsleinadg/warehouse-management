import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";
import { addStock, movingAverageCents, recordMovement, totalOnHand } from "@/lib/stock-ledger";

const lineSchema = z.object({
  materialId: z.uuid("Invalid material"),
  locationId: z.uuid("Invalid location"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
  unitCostCents: z.coerce.number().int().min(0, "Unit cost cannot be negative"),
});

const createSchema = z.object({
  number: z.string().trim().min(1, "NF number is required").max(64),
  supplier: z.string().trim().min(1, "Supplier is required").max(200),
  issuedAt: z.coerce.date("Invalid issue date"),
  lines: z.array(lineSchema).min(1, "At least one line is required").max(200),
});

function invalid(issues: { field: string; message: string }[], status: number) {
  return NextResponse.json({ errors: issues }, { status });
}

/** List purchase invoices, newest first. Operators and admins only. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR"]);
  if ("response" in auth) return auth.response;

  const invoices = await prisma.purchaseInvoice.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      number: true,
      supplier: true,
      issuedAt: true,
      createdAt: true,
      lines: { select: { quantity: true, unitCostCents: true } },
    },
  });

  return NextResponse.json({
    data: invoices.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      supplier: invoice.supplier,
      issuedAt: invoice.issuedAt,
      createdAt: invoice.createdAt,
      linesCount: invoice.lines.length,
      totalQuantity: invoice.lines.reduce((sum, line) => sum + line.quantity, 0),
      totalCostCents: invoice.lines.reduce(
        (sum, line) => sum + line.quantity * line.unitCostCents,
        0,
      ),
    })),
  });
}

/**
 * Register a purchase invoice (NF entry).
 * Creates INBOUND movements, adds stock to the informed locations and
 * refreshes each material moving-average cost — all in one transaction.
 * Invoices are immutable by design: no update/delete endpoints exist.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR"]);
  if ("response" in auth) return auth.response;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return invalid(
      parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      })),
      400,
    );
  }

  const duplicate = await prisma.purchaseInvoice.findUnique({
    where: { number: parsed.data.number },
    select: { id: true },
  });
  if (duplicate) {
    return invalid(
      [{ field: "number", message: `NF "${parsed.data.number}" is already registered` }],
      409,
    );
  }

  // @@unique([invoiceId, materialId]): mesma dupla material+local em duas
  // linhas estouraria P2002 — agregue na UI ou devolva 409 aqui.
  const seenLines = new Set<string>();
  for (const [index, line] of parsed.data.lines.entries()) {
    const key = `${line.materialId}::${line.locationId}`;
    if (seenLines.has(key)) {
      return invalid(
        [
          {
            field: `lines.${index}`,
            message: "Duplicate material in the same location — merge into a single line",
          },
        ],
        409,
      );
    }
    seenLines.add(key);
  }

  const materialIds = [...new Set(parsed.data.lines.map((line) => line.materialId))];
  const locationIds = [...new Set(parsed.data.lines.map((line) => line.locationId))];
  const [materials, locations] = await Promise.all([
    prisma.material.findMany({
      where: { id: { in: materialIds } },
      select: { id: true, code: true, disabled: true, costCents: true },
    }),
    prisma.location.findMany({
      where: { id: { in: locationIds } },
      select: { id: true, name: true, disabled: true },
    }),
  ]);
  const materialById = new Map(materials.map((m) => [m.id, m]));
  const locationById = new Map(locations.map((l) => [l.id, l]));

  for (const [index, line] of parsed.data.lines.entries()) {
    const material = materialById.get(line.materialId);
    if (!material) {
      return invalid(
        [{ field: `lines.${index}.materialId`, message: "Material not found in catalog" }],
        404,
      );
    }
    if (material.disabled) {
      return invalid(
        [
          {
            field: `lines.${index}.materialId`,
            message: `Material "${material.code}" is disabled`,
          },
        ],
        409,
      );
    }
    const location = locationById.get(line.locationId);
    if (!location) {
      return invalid(
        [{ field: `lines.${index}.locationId`, message: "Location not found" }],
        404,
      );
    }
    if (location.disabled) {
      return invalid(
        [
          {
            field: `lines.${index}.locationId`,
            message: `Location "${location.name}" is disabled`,
          },
        ],
        409,
      );
    }
  }

  const invoice = await prisma.$transaction(async (tx) => {
    const created = await tx.purchaseInvoice.create({
      data: {
        number: parsed.data.number,
        supplier: parsed.data.supplier,
        issuedAt: parsed.data.issuedAt,
        lines: {
          create: parsed.data.lines.map((line) => ({
            materialId: line.materialId,
            quantity: line.quantity,
            unitCostCents: line.unitCostCents,
          })),
        },
      },
      select: {
        id: true,
        number: true,
        supplier: true,
        issuedAt: true,
        lines: {
          select: { materialId: true, quantity: true, unitCostCents: true },
        },
      },
    });

    for (const line of parsed.data.lines) {
      const material = materialById.get(line.materialId);
      const previousTotal = await totalOnHand(tx, line.materialId);
      await addStock(tx, {
        materialId: line.materialId,
        locationId: line.locationId,
        quantity: line.quantity,
      });
      await recordMovement(tx, {
        type: "INBOUND",
        quantity: line.quantity,
        materialId: line.materialId,
        userId: auth.user.userId,
        nfNumber: created.number,
        locationId: line.locationId,
      });
      await tx.material.update({
        where: { id: line.materialId },
        data: {
          costCents: movingAverageCents(
            previousTotal,
            material?.costCents ?? 0,
            line.quantity,
            line.unitCostCents,
          ),
        },
        select: { id: true },
      });
    }
    return created;
  });

  return NextResponse.json({ data: invoice }, { status: 201 });
}
