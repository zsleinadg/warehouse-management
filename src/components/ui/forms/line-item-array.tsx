"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { LineItemRow, LineItemFieldConfig } from "./line-item-row";

export interface LineItemArrayProps<T extends Record<string, unknown>> {
  items: T[];
  onItemsChange: (items: T[]) => void;
  fields: LineItemFieldConfig<T>[];
  emptyItem: T;
  addButtonLabel?: string;
  canRemove?: boolean;
  className?: string;
  maxItems?: number;
}

export function LineItemArray<T extends Record<string, unknown>>({
  items,
  onItemsChange,
  fields,
  emptyItem,
  addButtonLabel = "+ Adicionar item",
  canRemove = true,
  className,
  maxItems,
}: LineItemArrayProps<T>) {
  const handleUpdate = (index: number, patch: Partial<T>) => {
    onItemsChange(
      items.map((item, i) => (i === index ? { ...item, ...patch } : item))
    );
  };

  const handleRemove = (index: number) => {
    onItemsChange(items.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    if (maxItems && items.length >= maxItems) return;
    onItemsChange([...items, { ...emptyItem }]);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {items.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <p className="mb-2">Nenhum item adicionado</p>
          <Button onClick={handleAdd} className="gap-2">
            <Plus className="h-4 w-4" />
            {addButtonLabel}
          </Button>
        </div>
      ) : (
        <>
          {items.map((item, index) => (
            <LineItemRow
              key={index}
              item={item}
              index={index}
              onUpdate={handleUpdate}
              onRemove={canRemove ? handleRemove : undefined}
              fields={fields}
              canRemove={canRemove && items.length > 1}
            />
          ))}
          {(maxItems === undefined || items.length < maxItems) && (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2 justify-center"
              onClick={handleAdd}
            >
              <Plus className="h-4 w-4" />
              {addButtonLabel}
            </Button>
          )}
        </>
      )}
    </div>
  );
}