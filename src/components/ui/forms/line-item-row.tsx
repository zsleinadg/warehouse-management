"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { FormSelect, FormSelectOption } from "./form-select";
import { FormInput } from "./form-input";

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
  type: "select" | "input" | "number";
  label: string;
  placeholder?: string;
  options?: FormSelectOption[];
  className?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
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
              type="number"
              placeholder={field.placeholder}
              value={(item[field.key] as number) ?? ""}
              onChange={(e) => onUpdate(index, { [field.key]: Number(e.target.value) || 0 } as Partial<T>)}
              required={field.required}
              min={field.min}
              max={field.max}
              step={field.step}
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