"use client";
import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { Logo } from "./app-shell";
export function AccountFrame({ children }: { children: ReactNode }) {
  const { user, ready, authEnabled } = useSession();
  const router = useRouter();
  useEffect(() => { if (ready && (!authEnabled || !user)) router.replace("/login"); }, [ready, authEnabled, user, router]);
  if (!ready || !user || !authEnabled) return <p role="status" className="p-6">Verificando cuenta…</p>;
  return <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-4 py-10"><Logo /><nav aria-label="Cuenta" className="flex flex-wrap gap-4 text-sm text-primary"><Link href="/homes" className="underline">Mis viviendas</Link><Link href="/account" className="underline">Mi cuenta</Link></nav>{children}</main>;
}
