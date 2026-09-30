"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMe } from "@/hooks/use-me";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/estoque", label: "Estoque" },
  { href: "/materiais", label: "Materiais" },
  { href: "/locais", label: "Locais" },
  { href: "/entradas", label: "Entradas · NF" },
  { href: "/saidas", label: "Saídas · OT" },
  { href: "/devolucoes", label: "Devoluções" },
  { href: "/contagem", label: "Contagem" },
  { href: "/auditoria", label: "Auditoria" },
  { href: "/relatorios", label: "Relatórios" },
  { href: "/isometrica", label: "Isométrica" },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: me } = useMe();

  if (pathname === "/login") {
    return <>{children}</>;
  }

  async function logout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto flex h-screen max-w-6xl gap-3 p-3">
      <aside className="flex w-60 flex-shrink-0 flex-col overflow-y-auto rounded-xl border border-zinc-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-900">
        <h1 className="mx-1.5 my-1 mb-2.5 text-base font-semibold">Almoxarifado</h1>
        <nav className="flex flex-1 flex-col gap-0.5">
          {NAV.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-2 py-1.5 text-[13px] hover:bg-sky-100 dark:hover:bg-sky-950 ${
                  active
                    ? "border border-sky-400 bg-sky-100 font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300"
                    : "border border-transparent"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        {me && (
          <div className="mt-2 flex items-center justify-between border-t border-zinc-200 px-1.5 pt-2 text-xs text-zinc-500 dark:border-zinc-700">
            <span>
              {me.name} · {me.role}
            </span>
            <button
              onClick={logout}
              className="font-medium hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              Sair
            </button>
          </div>
        )}
      </aside>
      <main className="flex flex-1 flex-col overflow-y-auto rounded-xl border border-zinc-200 bg-white p-3.5 dark:border-zinc-700 dark:bg-zinc-900">
        {children}
      </main>
    </div>
  );
}
