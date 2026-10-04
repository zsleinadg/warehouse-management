"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Package,
  Boxes,
  MapPin,
  FileText,
  Truck,
  RotateCcw,
  ClipboardList,
  Search,
  BarChart,
  GitBranch,
  Menu,
  ChevronLeft,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/estoque", label: "Estoque", icon: Package },
  { href: "/materiais", label: "Materiais", icon: Boxes },
  { href: "/locais", label: "Locais", icon: MapPin },
  { href: "/entradas", label: "Entradas", icon: FileText },
  { href: "/saidas", label: "Saídas", icon: Truck },
  { href: "/devolucoes", label: "Devoluções", icon: RotateCcw },
  { href: "/contagem", label: "Contagem", icon: ClipboardList },
  { href: "/auditoria", label: "Auditoria", icon: Search },
  { href: "/relatorios", label: "Relatórios", icon: BarChart },
  { href: "/isometrica", label: "Isométrica", icon: GitBranch },
];

export function SidebarLogo({ expanded }: { expanded: boolean }) {
  return (
    <div className="flex h-16 items-center border-b px-3.5 gap-3 shrink-0 overflow-hidden">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">
        W
      </div>
      <span
        className={cn(
          "font-semibold text-lg truncate transition-opacity duration-300 whitespace-nowrap",
          expanded ? "opacity-100 delay-100" : "opacity-0 pointer-events-none"
        )}
      >
        Almoxarifado
      </span>
    </div>
  );
}

export function SidebarNavLinks({
  expanded,
  onNavigate,
}: {
  expanded: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { setCurrentView } = useAppStore();

  return (
    <nav className="flex-1 space-y-1 p-2 overflow-y-auto overflow-x-hidden" aria-label="Navigation">
      {NAV.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;

        const linkContent = (
          <Link
            href={item.href}
            onClick={() => {
              setCurrentView(item.label);
              onNavigate?.();
            }}
            className={cn(
              "flex items-center h-10 px-2.5 rounded-lg transition-colors duration-200 group relative",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
            aria-current={active ? "page" : undefined}
          >
            <div className="flex shrink-0 items-center justify-center w-5 h-5">
              <Icon size={20} strokeWidth={active ? 2.5 : 2} />
            </div>
            <span
              className={cn(
                "ml-3 text-sm truncate transition-all duration-300 whitespace-nowrap",
                expanded
                  ? "opacity-100 translate-x-0 delay-75"
                  : "opacity-0 -translate-x-2 pointer-events-none w-0"
              )}
            >
              {item.label}
            </span>
          </Link>
        );

        if (!expanded) {
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
              <TooltipContent side="right">
                <span>{item.label}</span>
              </TooltipContent>
            </Tooltip>
          );
        }

        return <div key={item.href}>{linkContent}</div>;
      })}
    </nav>
  );
}

/** Conteúdo do drawer mobile (sempre expandido; fecha ao navegar). */
export function SidebarDrawer({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <SidebarLogo expanded />
      <SidebarNavLinks expanded onNavigate={onNavigate} />
    </div>
  );
}

/** Sidebar fixa do desktop — escondida no mobile (`hidden md:flex`). */
export function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useAppStore();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 h-screen border-r bg-sidebar transition-[width] duration-300 ease-in-out hidden md:flex flex-col select-none overflow-hidden",
        sidebarOpen ? "w-64" : "w-16"
      )}
    >
      <SidebarLogo expanded={sidebarOpen} />
      <SidebarNavLinks expanded={sidebarOpen} />

      {/* Footer / Toggle Button */}
      <div className="border-t p-2 shrink-0 overflow-hidden">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={cn(
            "flex items-center h-10 w-full px-2.5 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors duration-200",
            !sidebarOpen && "justify-center"
          )}
          aria-label={sidebarOpen ? "Colapsar sidebar" : "Expandir sidebar"}
        >
          <div className="flex shrink-0 items-center justify-center w-5 h-5">
            {sidebarOpen ? <ChevronLeft size={20} /> : <Menu size={20} />}
          </div>
          <span
            className={cn(
              "ml-3 text-sm truncate transition-all duration-300 whitespace-nowrap",
              sidebarOpen
                ? "opacity-100 translate-x-0 delay-75"
                : "opacity-0 -translate-x-2 pointer-events-none w-0"
            )}
          >
            Colapsar menu
          </span>
        </button>
      </div>
    </aside>
  );
}
