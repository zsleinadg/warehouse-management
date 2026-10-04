import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { authorize } from "@/lib/roles";

const itemSchema = z.object({
  materialId: z.uuid("Invalid material"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
});

const addSchema = z.object({
  items: z.array(itemSchema).min(1, "At least one item is required").max(200),
});

function invalid(issues: { field: string; message: string }[], status: number) {
  return NextResponse.json({ errors: issues }, { status });
}

/**
 * Acréscimo: add items (or extra quantity) to a DRAFT issue before pickup.
 * New lines and merged quantities are flagged isExtra so the OT visibly
 * shows what was added after creation.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authorize(request, ["ADMIN", "OPERATOR"]);
  if ("response" in auth) return auth.response;

  const parsed = addSchema.safeParse(await request.json().catch(() => null));
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
      status: true,
      items: { select: { id: true, materialId: true } },
    },
  });
  if (!issue) {
    return invalid([{ field: "id", message: "Issue not found" }], 404);
  }
  if (issue.status !== "DRAFT") {
    return invalid(
      [{ field: "status", message: `Only draft issues accept additions, current status is ${issue.status}` }],
      409,
    );
  }

  const seen = new Set<string>();
  for (const [index, item] of parsed.data.items.entries()) {
    if (seen.has(item.materialId)) {
      return invalid(
        [{ field: `items.${index}`, message: "Duplicate material — merge into a single line" }],
        409,
      );
    }
    seen.add(item.materialId);
  }

  const materials = await prisma.material.findMany({
    where: { id: { in: [...seen] } },
    select: { id: true, code: true, disabled: true },
  });
  const materialById = new Map(materials.map((m) => [m.id, m]));
  for (const [index, item] of parsed.data.items.entries()) {
    const material = materialById.get(item.materialId);
    if (!material) {
      return invalid(
        [{ field: `items.${index}.materialId`, message: "Material not found in catalog" }],
        404,
      );
    }
    if (material.disabled) {
      return invalid(
        [{ field: `items.${index}.materialId`, message: `Material "${material.code}" is disabled` }],
        409,
      );
    }
  }

  const existingByMaterial = new Map(issue.items.map((item) => [item.materialId, item.id]));
  const updated = await prisma.$transaction(async (tx) => {
    for (const item of parsed.data.items) {
      const existingId = existingByMaterial.get(item.materialId);
      let issueItemId = existingId;
      if (existingId) {
        await tx.issueItem.update({
          where: { id: existingId },
          data: { quantity: { increment: item.quantity }, isExtra: true },
          select: { id: true },
        });
      } else {
        const created = await tx.issueItem.create({
          data: { issueId: id, materialId: item.materialId, quantity: item.quantity, isExtra: true },
          select: { id: true },
        });
        issueItemId = created.id;
      }
      // Histórico de cada acréscimo (vez, qtd, quem, quando) — a linha soma,
      // mas cada adição fica registrada e visível no detalhe da OT.
      await tx.issueItemAddition.create({
        data: { issueItemId: issueItemId as string, quantity: item.quantity, userId: auth.user.userId },
        select: { id: true },
      });
    }
    return tx.issue.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        status: true,
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            quantity: true,
            fulfilledQuantity: true,
            isExtra: true,
            createdAt: true,
            material: { select: { id: true, code: true, name: true, unit: true } },
            additions: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                quantity: true,
                createdAt: true,
                user: { select: { name: true } },
              },
            },
          },
        },
      },
    });
  });

  return NextResponse.json({ data: updated }, { status: 201 });
}
