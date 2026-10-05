"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Bell, Menu, LogOut, User } from "lucide-react";
import { useMe } from "@/hooks/use-me";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { SidebarDrawer } from "./Sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CommandPalette } from "./CommandPalette";

export function Header() {
  const router = useRouter();
  const { data: me } = useMe();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-30 h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <div className="md:hidden">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="-ml-2">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64">
              <SidebarDrawer onNavigate={() => setMobileMenuOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
            <span className="h-8 w-8 flex items-center justify-center rounded-lg bg-primary text-primary-foreground">W</span>
            Almoxarifado
          </Link>
        </div>
        <Link href="/" className="flex md:hidden items-center gap-2 font-semibold">
          <span className="h-8 w-8 flex items-center justify-center rounded-lg bg-primary text-primary-foreground">W</span>
          Almoxarifado
        </Link>
      </div>

      <div className="hidden md:flex items-center relative max-w-md w-full mx-4">
        <Button
          variant="outline"
          className="w-full justify-start text-muted-foreground font-normal"
          onClick={() => setPaletteOpen(true)}
        >
          <Search className="h-4 w-4 mr-2" />
          Buscar no almoxarifado...
          <span className="ml-auto text-[10px] bg-background border px-1.5 rounded font-mono">
            ⌘K
          </span>
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
              <Bell className="h-5 w-5" />
              <Badge variant="secondary" className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px]">
                3
              </Badge>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[calc(100vw-2rem)] sm:w-80">
            <div className="flex items-center justify-between px-1.5 py-1">
              <p className="text-xs font-medium text-muted-foreground">Notificações</p>
              <Button variant="ghost" size="sm" className="h-6 text-xs">
                Marcar todas como lidas
              </Button>
            </div>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-sm text-muted-foreground">
              Nenhuma notificação nova
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {me?.name?.[0]?.toUpperCase() ?? "U"}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-1.5 py-1">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{me?.name ?? "Usuário"}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">{me?.email ?? ""}</span>
                <Badge variant="secondary" className="mt-1 w-fit capitalize">{me?.role?.toLowerCase() ?? "viewer"}</Badge>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/profile")}>
              <User className="mr-2 h-4 w-4" />
              Perfil
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => {
                await fetch("/api/auth/logout", { method: "POST" });
                router.push("/login");
                router.refresh();
              }}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onSelect={(href) => {
          router.push(href);
          router.refresh();
        }}
      />
    </header>
  );
}