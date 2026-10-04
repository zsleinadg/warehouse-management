"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface FormActionsProps {
  onSubmit: () => void;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
  variant?: "default" | "destructive";
  className?: string;
  submitDisabled?: boolean;
}

export function FormActions({
  onSubmit,
  onCancel,
  submitLabel = "Salvar",
  cancelLabel = "Cancelar",
  isSubmitting = false,
  variant = "default",
  className,
  submitDisabled,
}: FormActionsProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {onCancel && (
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          {cancelLabel}
        </Button>
      )}
      <Button
        type="button"
        variant={variant === "destructive" ? "destructive" : "default"}
        onClick={onSubmit}
        disabled={isSubmitting || submitDisabled}
      >
        {isSubmitting ? "Salvando..." : submitLabel}
      </Button>
    </div>
  );
}