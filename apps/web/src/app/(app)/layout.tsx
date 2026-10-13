import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";

// Account gating happens in middleware.ts (edge), not here: this avoids
// next/headers cookies() in a Server Component, which can serialize raw
// cookie values into dev-mode RSC debug payloads.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
