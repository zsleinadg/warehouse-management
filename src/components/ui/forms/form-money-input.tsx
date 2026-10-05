"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { formatCentsInput } from "@/lib/money";

export interface FormMoneyInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "id" | "type" | "value" | "onChange" | "inputMode"
  > {
  label: string;
  /** Integer cents (storage convention). */
  valueCents: number;
  onChangeCents: (cents: number) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  id?: string;
}

/**
 * BRL money input: displays "1.300,50" with an R$ prefix, emits integer
 * cents. Text-based (no number spinners), numeric mobile keyboard.
 */
const FormMoneyInput = React.forwardRef<HTMLInputElement, FormMoneyInputProps>(
  ({ label, valueCents, onChangeCents, error, hint, required, className, id, ...props }, ref) => {
    const inputId = id || label.toLowerCase().replace(/\s+/g, "-");

    function handleChange(event: React.ChangeEvent<HTMLInputElement>): void {
      // Reinterpret the full digit string every keystroke so typing,
      // deletion and paste all stay consistent ("130050" -> 130050).
      const digits = event.target.value.replace(/\D/g, "");
      onChangeCents(digits ? parseInt(digits, 10) : 0);
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
      if (["e", "E", "+", "-"].includes(event.key)) event.preventDefault();
    }

    return (
      <div className={cn("space-y-1.5", className)}>
        <Label htmlFor={inputId}>
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            R$
          </span>
          <Input
            id={inputId}
            ref={ref}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="0,00"
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            className={cn("pl-9", error && "border-destructive focus:ring-destructive")}
            value={formatCentsInput(valueCents)}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            {...props}
          />
        </div>
        {error && (
          <p id={`${inputId}-error`} className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-sm text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
    );
  }
);
FormMoneyInput.displayName = "FormMoneyInput";

export { FormMoneyInput };
