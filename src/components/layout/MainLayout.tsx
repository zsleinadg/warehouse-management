"use client";

import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useAppStore } from "@/store/useAppStore";
import { cn } from "@/lib/utils";

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { sidebarOpen } = useAppStore();

  return (
    <div className="relative min-h-screen bg-background">
      {/* Sidebar Fixa */}
      <Sidebar />

      {/* Conteúdo Principal com Margem Dinâmica Sem o prefixo 'md:' */}
      <div
        className={cn(
          "flex flex-col min-h-screen transition-all duration-300 ease-in-out",
          "ml-0",
          sidebarOpen ? "md:ml-64" : "md:ml-16"
        )}
      >
        <Header />
        <main className="flex-1 overflow-auto bg-muted/30 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}