"use client";

import { Bell, ChevronsUpDown, Gauge, Home as HomeIcon, NotebookPen, Plug, Receipt, BarChart3, Target, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAlerts, useHomes } from "@/lib/api/hooks";
import { cn } from "@/lib/cn";
import { useSession } from "@/lib/session";

const NAV = [
  { href: "/dashboard", label: "Inicio", icon: Gauge },
  { href: "/consumption", label: "Consumo", icon: BarChart3 },
  { href: "/readings", label: "Lecturas", icon: NotebookPen },
  { href: "/bills", label: "Facturas", icon: Receipt },
  { href: "/goal", label: "Meta", icon: Target, sideOnly: true },
  { href: "/equipment", label: "Equipos", icon: Plug },
  { href: "/alerts", label: "Alertas", icon: Bell },
  { href: "/profile", label: "Perfil", icon: UserRound, sideOnly: true },
] as const;

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2">
      <Image src="/brand/logo-96.png" alt="" width={size} height={size} className="rounded-lg" priority />
      <span className="text-lg font-bold tracking-tight">Energy RD</span>
    </span>
  );
}

/** Selector de vivienda siempre visible: cambiar de vivienda no es "cerrar sesión". */
function HomeSwitcher({ compact = false }: { compact?: boolean }) {
  const { homeId, signIn } = useSession();
  const homes = useHomes();
  const current = homes.data?.find((h) => h.id === homeId);
  return (
    <label className={cn("relative flex flex-col gap-0.5", compact ? "min-w-0 flex-1" : "")}>
      {!compact ? <span className="text-[11px] font-semibold uppercase text-muted-foreground">Vivienda</span> : null}
      <span className="relative flex items-center">
        <HomeIcon className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
        <select
          aria-label="Vivienda activa"
          value={homeId ?? ""}
          onChange={(e) => e.target.value && signIn(e.target.value)}
          className="h-10 w-full appearance-none truncate rounded-lg border border-border bg-background pl-8 pr-8 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {!current ? <option value={homeId ?? ""}>Cargando…</option> : null}
          {homes.data?.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name.replace(" (demo)", "")} · {h.distributor}
            </option>
          ))}
        </select>
        <ChevronsUpDown className="pointer-events-none absolute right-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
      </span>
    </label>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { homeId, ready, authEnabled, user } = useSession();
  const alerts = useAlerts(homeId ?? "");
  const unread = alerts.data?.filter((a) => a.status === "unread").length ?? 0;

  useEffect(() => {
    if (ready && authEnabled && !user) router.replace("/login");
    else if (ready && !homeId) router.replace(authEnabled ? "/homes" : "/login");
  }, [ready, homeId, router, authEnabled, user]);

  if (!ready || !homeId || (authEnabled && !user)) {
    return (
      <p role="status" className="p-6 text-sm text-muted-foreground">
        Cargando…
      </p>
    );
  }

  const links = (variant: "side" | "bottom") =>
    // La barra inferior (móvil) muestra 6 destinos; Meta se abre desde la tarjeta del inicio.
    NAV.filter((item) => variant === "side" || !("sideOnly" in item)).map(({ href, label, icon: Icon }) => {
      const active = pathname === href || pathname.startsWith(`${href}/`);
      const badge = href === "/alerts" && unread > 0 ? unread : null;
      return (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          aria-label={badge ? `${label}, ${badge} sin leer` : undefined}
          className={cn(
            "relative flex items-center rounded-lg font-medium transition-colors",
            variant === "side"
              ? "gap-3 px-3 py-2 text-sm hover:bg-muted"
              : "min-h-[52px] flex-1 flex-col justify-center gap-0.5 text-[11px]",
            active ? (variant === "side" ? "bg-brand-50 text-primary" : "text-primary") : "text-foreground/80",
          )}
        >
          <Icon className={variant === "side" ? "h-4 w-4" : "h-5 w-5"} aria-hidden />
          {label}
          {badge ? (
            <span
              className={cn(
                "rounded-full bg-danger px-1.5 text-[10px] font-bold leading-4 text-white",
                variant === "side" ? "ml-auto" : "absolute right-[calc(50%-18px)] top-1.5",
              )}
            >
              {badge}
            </span>
          ) : null}
        </Link>
      );
    });

  return (
    <div className="flex min-h-screen flex-col bg-canvas md:flex-row">
      {/* ERD-WEB-QUALITY H2 (WCAG 2.4.1): primer destino del tabulador; visible solo al recibir foco. */}
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary"
      >
        Saltar al contenido
      </a>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 border-r border-border bg-background p-4 md:flex">
        <Logo />
        <HomeSwitcher />
        <nav aria-label="Principal" className="flex flex-col gap-1">
          {links("side")}
        </nav>
        <div className="mt-auto flex flex-col gap-3 text-sm">{authEnabled ? <><Link href="/homes" className="text-primary underline">Mis viviendas</Link><Link href="/account" className="text-primary underline">Mi cuenta</Link></> : null}<p className="text-xs text-muted-foreground">{authEnabled ? "Facturas y lecturas del medidor" : "Piloto · facturas y lecturas del medidor"}</p></div>
      </aside>

      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background px-4 py-2 md:hidden">
        <Image src="/brand/logo-96.png" alt="Energy RD" width={32} height={32} className="rounded-lg" />
        <HomeSwitcher compact />
        <Link href="/profile" className="shrink-0 rounded-lg px-2 py-2 text-sm text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Perfil</Link>
        {authEnabled ? <Link href="/account" className="text-sm text-primary underline">Cuenta</Link> : null}
      </header>

      <main id="contenido" tabIndex={-1} className="flex-1 p-4 pb-24 focus:outline-none md:p-8 md:pb-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>

      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {links("bottom")}
      </nav>
    </div>
  );
}
