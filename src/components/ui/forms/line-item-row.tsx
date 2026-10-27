"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { FormSelect, FormSelectOption } from "./form-select";
import { FormInput } from "./form-input";
import { FormMoneyInput } from "./form-money-input";
import { MaterialPicker } from "@/components/labels/MaterialPicker";

const DECIMAL_UNITS = new Set(["M", "KG", "MM"]);

function unitAllowsDecimals(unit: string): boolean {
  return DECIMAL_UNITS.has(unit);
}

export interface LineItemRowProps<T extends Record<string, unknown>> {
  item: T;
  index: number;
  onUpdate: (index: number, patch: Partial<T>) => void;
  onRemove?: (index: number) => void;
  fields: LineItemFieldConfig<T>[];
  canRemove?: boolean;
  className?: string;
}

export interface LineItemFieldConfig<T> {
  key: keyof T;
  type: "select" | "input" | "number" | "money" | "material-picker";
  label: string;
  placeholder?: string;
  options?: FormSelectOption[];
  className?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  autoFill?: Partial<Record<keyof T, string>>;
  allowDecimals?: boolean;
}

interface MaterialOption {
  id: string;
  code: string;
  name: string;
  unit: string;
}

function blockExponentKeys(event: React.KeyboardEvent<HTMLInputElement>): void {
  if (["e", "E", "+", "-"].includes(event.key)) event.preventDefault();
}

export function LineItemRow<T extends Record<string, unknown>>({
  item,
  index,
  onUpdate,
  onRemove,
  fields,
  canRemove = true,
  className,
}: LineItemRowProps<T>) {
  return (
    <div className={cn("flex flex-wrap gap-2 items-end", className)}>
      {fields.map((field) => (
        <div key={String(field.key)} className={cn("flex-1 min-w-[140px]", field.className)}>
          {field.type === "select" ? (
            <FormSelect
              label={field.label}
              options={field.options ?? []}
              placeholder={field.placeholder}
              value={(item[field.key] as string) || ""}
              onValueChange={(value) => onUpdate(index, { [field.key]: value } as Partial<T>)}
              required={field.required}
              allowClear={true}
            />
          ) : field.type === "material-picker" ? (
            <MaterialPicker
              value={(item[field.key] as string) || ""}
              onChange={(materialId, selectedItem) => {
                const updates: Partial<T> = { [field.key]: materialId } as Partial<T>;
                if (selectedItem && field.autoFill) {
                  for (const [targetKey, sourceKey] of Object.entries(field.autoFill)) {
                    const sourceValue = selectedItem[sourceKey as keyof MaterialOption];
                    if (sourceValue !== undefined) {
                      // Convert unit string to boolean for allowDecimals
                      if (targetKey === "allowDecimals" && typeof sourceValue === "string") {
                        updates[targetKey as keyof T] = unitAllowsDecimals(sourceValue) as T[keyof T];
                      } else {
                        updates[targetKey as keyof T] = sourceValue as T[keyof T];
                      }
                    }
                  }
                }
                onUpdate(index, updates);
              }}
              disabled={false}
              placeholder={field.placeholder}
            />
          ) : field.type === "number" ? (
            <FormInput
              label={field.label}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder={field.placeholder}
              value={(item[field.key] as string) ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                // Allow typing: digits, optional single dot
                const cleaned = raw.replace(/[^0-9.]/g, "");
                const parts = cleaned.split(".");
                const valid = parts.length <= 2 ? cleaned : parts[0] + "." + parts.slice(1).join("");
                onUpdate(index, { [field.key]: valid } as Partial<T>);
              }}
              onBlur={(e) => {
                // Sanitize to number on blur
                const raw = e.target.value;
                const sanitized = field.allowDecimals
                  ? (() => {
                      const cleaned = raw.replace(/[^0-9.]/g, "");
                      const parts = cleaned.split(".");
                      if (parts.length > 2) {
                        return parts[0] ? parseFloat(parts[0] + "." + parts.slice(1).join("")) : 0;
                      }
                      return cleaned ? parseFloat(cleaned) : 0;
                    })()
                  : (() => {
                      const digits = raw.replace(/\D/g, "");
                      return digits ? parseInt(digits, 10) : 0;
                    })();
                onUpdate(index, { [field.key]: sanitized } as Partial<T>);
              }}
              onKeyDown={blockExponentKeys}
              required={field.required}
            />
          ) : field.type === "money" ? (
            <FormMoneyInput
              label={field.label}
              valueCents={(item[field.key] as number) ?? 0}
              onChangeCents={(cents) => onUpdate(index, { [field.key]: cents } as Partial<T>)}
              required={field.required}
            />
          ) : (
            <FormInput
              label={field.label}
              placeholder={field.placeholder}
              value={(item[field.key] as string) || ""}
              onChange={(e) => onUpdate(index, { [field.key]: e.target.value } as Partial<T>)}
              required={field.required}
            />
          )}
        </div>
      ))}
      {canRemove && onRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(index)}
          aria-label="Remover item"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}