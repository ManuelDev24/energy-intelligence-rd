import { NextResponse, type NextRequest } from "next/server";
// Edge/middleware gate: never calls next/headers cookies() or RSC rendering,
// so cookie values cannot reach any dev-mode RSC debug serialization.
const PROTECTED = ["/dashboard", "/consumption", "/readings", "/goal", "/bills", "/equipment", "/alerts", "/homes", "/account", "/profile"];
export async function middleware(request: NextRequest) {
  // ERD-AUTH-05 / ERD-SHARE-01: páginas públicas con token en el fragmento. El token es un fragmento (no llega al servidor), pero
  // reforzamos el encabezado para que ni la ruta ni futuras variantes viajen como Referer.
  if (request.nextUrl.pathname === "/restablecer-contrasena" || request.nextUrl.pathname === "/invitacion") {
    const response = NextResponse.next();
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  if (!PROTECTED.some(prefix => request.nextUrl.pathname === prefix || request.nextUrl.pathname.startsWith(`${prefix}/`))) return NextResponse.next();
  if (process.env.NEXT_PUBLIC_AUTH_ENABLED !== "true") return NextResponse.next();
  const cookie = request.cookies.get("__Host-erd-access") ?? request.cookies.get("erd-access");
  if (!cookie) return NextResponse.redirect(new URL("/login", request.url));
  // Only the BFF's own cookies: access, the epoch it is bound to, and the revocation cookie
  // (so a session left over from before a logout is revoked by the probe, not kept alive).
  const prefix = cookie.name.startsWith("__Host-") ? "__Host-" : "";
  const forwarded = [cookie, request.cookies.get(`${prefix}erd-epoch`), request.cookies.get(`${prefix}erd-logout`)].filter(item => item !== undefined);
  const probe = await fetch(new URL("/api/bff/auth/me", request.url), { headers: { cookie: forwarded.map(item => `${item.name}=${item.value}`).join("; ") }, cache: "no-store", redirect: "manual" });
  if (!probe.ok) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}
export const config = { matcher: ["/dashboard/:path*", "/consumption/:path*", "/readings/:path*", "/goal/:path*", "/bills/:path*", "/equipment/:path*", "/alerts/:path*", "/homes/:path*", "/account/:path*", "/profile/:path*", "/restablecer-contrasena"] };
