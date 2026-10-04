"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export interface FormDateProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "type"> {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  id?: string;
}

const FormDate = React.forwardRef<HTMLInputElement, FormDateProps>(
  ({ label, error, hint, required, className, id, ...props }, ref) => {
    const inputId = id || label.toLowerCase().replace(/\s+/g, "-");
    return (
      <div className={cn("space-y-1.5", className)}>
        <Label htmlFor={inputId}>
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Input
          id={inputId}
          ref={ref}
          type="date"
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          className={cn(error && "border-destructive focus:ring-destructive")}
          {...props}
        />
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
FormDate.displayName = "FormDate";

export { FormDate };