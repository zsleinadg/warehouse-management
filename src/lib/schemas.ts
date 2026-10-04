import { z } from "zod";

export const materialSchema = z.object({
  code: z.string().min(1, "Código é obrigatório"),
  name: z.string().min(1, "Nome é obrigatório"),
  unit: z.string().min(1, "Unidade é obrigatória").default("UN"),
  minStock: z.coerce.number().int().min(0).default(0),
  costCents: z.coerce.number().int().min(0).default(0),
});

export const locationSchema = z.object({
  name: z.string().min(1, "Nome do local é obrigatório"),
  parentId: z.string().optional(),
});

export const purchaseInvoiceSchema = z.object({
  number: z.string().min(1, "Número da NF é obrigatório"),
  supplier: z.string().min(1, "Fornecedor é obrigatório"),
  issuedAt: z.string().min(1, "Data de emissão é obrigatória"),
  lines: z.array(z.object({
    materialId: z.string().min(1, "Material é obrigatório"),
    locationId: z.string().min(1, "Local é obrigatório"),
    quantity: z.coerce.number().int().min(1, "Quantidade deve ser maior que zero"),
    unitCostCents: z.coerce.number().int().min(0, "Custo não pode ser negativo"),
  })).min(1, "Pelo menos um item é obrigatório"),
});

export const issueSchema = z.object({
  ot: z.string().optional(),
  kind: z.enum(["OBRA", "EMERGENCIAL"]).default("OBRA"),
  vehiclePlate: z.string().optional(),
  nfNumber: z.string().optional(),
  destination: z.string().min(1, "Destino é obrigatório"),
  foreman: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(z.object({
    materialId: z.string().min(1, "Material é obrigatório"),
    quantity: z.coerce.number().int().min(1, "Quantidade deve ser maior que zero"),
  })).min(1, "Pelo menos um item é obrigatório"),
});

export const returnSchema = z.object({
  issueId: z.string().min(1, "Saída de origem é obrigatória"),
  reason: z.string().min(1, "Motivo é obrigatório"),
  items: z.array(z.object({
    materialId: z.string().min(1, "Material é obrigatório"),
    locationId: z.string().min(1, "Local de retorno é obrigatório"),
    quantity: z.coerce.number().int().min(1, "Quantidade deve ser maior que zero"),
  })).min(1, "Pelo menos um item é obrigatório"),
});

export const adjustmentSchema = z.object({
  locationId: z.string().min(1, "Localização é obrigatória"),
  reason: z.string().min(1, "Motivo é obrigatório"),
  items: z.array(z.object({
    materialId: z.string().min(1, "Material é obrigatório"),
    countedQuantity: z.coerce.number().int().min(0),
  })).min(1, "Pelo menos um item é obrigatório"),
});

export const reportFilterSchema = z.object({
  ot: z.string().optional(),
  kind: z.string().optional(),
  nfNumber: z.string().optional(),
  materialId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const auditFilterSchema = z.object({
  type: z.string().optional(),
  materialCode: z.string().optional(),
  nfNumber: z.string().optional(),
  issueId: z.string().optional(),
  take: z.coerce.number().int().min(1).max(1000).default(100),
});

export type MaterialFormData = z.infer<typeof materialSchema>;
export type LocationFormData = z.infer<typeof locationSchema>;
export type PurchaseInvoiceFormData = z.infer<typeof purchaseInvoiceSchema>;
export type IssueFormData = z.infer<typeof issueSchema>;
export type ReturnFormData = z.infer<typeof returnSchema>;
export type AdjustmentFormData = z.infer<typeof adjustmentSchema>;
export type ReportFilterData = z.infer<typeof reportFilterSchema>;
export type AuditFilterData = z.infer<typeof auditFilterSchema>;