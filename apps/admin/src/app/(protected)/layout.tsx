"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/session";
import { visibleNavItems } from "@/lib/access";
import { Loading } from "@/components/StateViews";
import { controlStyle } from "@/lib/controls";

/** Shared protected shell: redirects to /login when there is no session at all. Per-page
 * 403s (missing scope) are handled by each page itself, via the API's real response —
 * this layout only guards "logged in or not", never grants or hides scoped content. */
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const { access, loading } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !access) router.replace("/login");
  }, [access, loading, router]);

  if (loading) return <Loading />;
  if (!access) return <Loading />;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", minHeight: "100vh" }}>
      <nav style={{ flex: "0 0 220px", borderRight: "1px solid #ddd", padding: 16 }}>
        <p style={{ fontWeight: 600 }}>{access.email}</p>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {visibleNavItems(access).map((item) => (
            <li key={item.href} style={{ marginBottom: 8 }}>
              <Link href={item.href}>{item.label}</Link>
            </li>
          ))}
        </ul>
        <LogoutButton />
      </nav>
      <main style={{ flex: "1 1 320px", minWidth: 0, padding: 24 }}>{children}</main>
    </div>
  );
}

function LogoutButton() {
  const { logout } = useSession();
  const router = useRouter();
  return (
    <button style={controlStyle} onClick={() => { logout(); router.replace("/login"); }}>
      Cerrar sesión
    </button>
  );
}
