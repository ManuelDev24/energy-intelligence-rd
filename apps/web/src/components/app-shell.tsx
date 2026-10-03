"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ModeBanner } from "@/components/mode-banner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/consumption", label: "Consumo" },
  { href: "/bills", label: "Facturas" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { homeId, ready, signOut } = useSession();

  useEffect(() => {
    if (ready && !homeId) router.replace("/login");
  }, [ready, homeId, router]);

  if (!ready || !homeId) {
    return <p className="p-6 text-sm text-muted-foreground">Cargando…</p>;
  }

  const links = NAV.map(({ href, label }) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium hover:bg-muted",
          active && "bg-muted text-primary",
        )}
      >
        {label}
      </Link>
    );
  });

  return (
    <div className="flex min-h-screen flex-col">
      <ModeBanner />
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-border p-4 md:flex">
          <p className="mb-4 text-lg font-bold">⚡ Energy RD</p>
          <nav aria-label="Principal" className="flex flex-col gap-1">
            {links}
          </nav>
          <Button variant="outline" size="sm" className="mt-auto" onClick={signOut}>
            Cambiar vivienda
          </Button>
        </aside>
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 md:hidden">
          <nav aria-label="Principal" className="flex gap-1 overflow-x-auto">
            {links}
          </nav>
          <Button variant="outline" size="sm" onClick={signOut}>
            Salir
          </Button>
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
