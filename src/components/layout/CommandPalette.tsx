"use client";

import { useState, useEffect, useMemo } from "react";
import { Search } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

const COMMAND_ITEMS = [
  { label: "Dashboard", href: "/", shortcut: "⌘1" },
  { label: "Estoque", href: "/estoque", shortcut: "⌘2" },
  { label: "Materiais", href: "/materiais", shortcut: "⌘3" },
  { label: "Locais", href: "/locais", shortcut: "⌘4" },
  { label: "Entradas", href: "/entradas", shortcut: "⌘5" },
  { label: "Saídas", href: "/saidas", shortcut: "⌘6" },
  { label: "Devoluções", href: "/devolucoes", shortcut: "⌘7" },
  { label: "Contagem", href: "/contagem", shortcut: "⌘8" },
  { label: "Auditoria", href: "/auditoria", shortcut: "⌘9" },
  { label: "Relatórios", href: "/relatorios", shortcut: "⌘0" },
  { label: "Isométrica", href: "/isometrica", shortcut: "⌘I" },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (href: string) => void;
}

export function CommandPalette({ open, onOpenChange, onSelect }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredItems = useMemo(() => {
    if (!query) return COMMAND_ITEMS;
    const q = query.toLowerCase();
    return COMMAND_ITEMS.filter(
      (item) => item.label.toLowerCase().includes(q) || item.shortcut.toLowerCase().includes(q)
    );
  }, [query]);

  // Reset selection when query changes (derived state pattern)
  const currentSelectedIndex = query ? 0 : selectedIndex;

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filteredItems[selectedIndex]) {
        e.preventDefault();
        onSelect(filteredItems[selectedIndex].href);
        onOpenChange(false);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filteredItems, selectedIndex, onSelect, onOpenChange]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] w-[calc(100vw-2rem)] p-0 sm:max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Digite um comando ou busque..."
              className="pl-10 h-10 w-full bg-transparent border-none outline-none text-base sm:text-sm"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {filteredItems.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">Nenhum resultado encontrado.</div>
          ) : (
            <div className="space-y-0.5">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Navegação</div>
              {filteredItems.map((item, index) => (
                <button
                  key={item.href}
                  onClick={() => {
                    onSelect(item.href);
                    onOpenChange(false);
                  }}
                  className={`flex min-h-[44px] items-center justify-between w-full px-2 py-2 text-sm rounded-md transition-colors ${
                    index === currentSelectedIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  <span>{item.label}</span>
                  <span className="ml-auto text-xs tracking-widest opacity-60">{item.shortcut}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}