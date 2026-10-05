"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { FormSelect, FormSelectOption } from "./form-select";
import { FormInput } from "./form-input";
import { FormMoneyInput } from "./form-money-input";

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
  type: "select" | "input" | "number" | "money";
  label: string;
  placeholder?: string;
  options?: FormSelectOption[];
  className?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
}

function sanitizeInteger(raw: string): number {
  const digits = raw.replace(/\D/g, "");
  return digits ? parseInt(digits, 10) : 0;
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
          ) : field.type === "number" ? (
            <FormInput
              label={field.label}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder={field.placeholder}
              value={(item[field.key] as number) ?? ""}
              onChange={(e) =>
                onUpdate(index, { [field.key]: sanitizeInteger(e.target.value) } as Partial<T>)
              }
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