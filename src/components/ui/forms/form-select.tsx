"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

export interface FormSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface FormSelectProps {
  label: string;
  options: FormSelectOption[];
  error?: string;
  hint?: string;
  required?: boolean;
  placeholder?: string;
  allowClear?: boolean;
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}

function FormSelect({
  label,
  options,
  error,
  hint,
  required,
  placeholder,
  allowClear,
  value,
  onValueChange,
  disabled,
  className,
  id,
}: FormSelectProps) {
  const selectId = id || label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={selectId}>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <Select
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
      >
        <SelectTrigger
          id={selectId}
          aria-invalid={!!error}
          aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
          className={cn(error && "border-destructive focus:ring-destructive")}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowClear && (
            <SelectItem value="">
              {placeholder || "Limpar seleção"}
            </SelectItem>
          )}
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p id={`${selectId}-error`} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${selectId}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

export { FormSelect };