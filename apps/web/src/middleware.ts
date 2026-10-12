import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@/lib/security-headers";
// Edge/middleware gate: never calls next/headers cookies() or RSC rendering,
// so cookie values cannot reach any dev-mode RSC debug serialization.
const PROTECTED = ["/dashboard", "/consumption", "/readings", "/goal", "/bills", "/equipment", "/alerts", "/homes", "/account", "/profile"];

// Auditoría C-06: CSP con nonce por petición para toda página (Next aplica el nonce a sus scripts en línea al ver la cabecera en la
// petición; por eso el layout raíz es dinámico). El resto de cabeceras de seguridad son estáticas y viven en next.config.mjs.
function withSecurity(request: NextRequest, build: (headers: Headers) => NextResponse): NextResponse {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp({
    nonce, development: process.env.NODE_ENV !== "production",
    apiOrigin: process.env.NEXT_PUBLIC_API_URL, sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  });
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const response = build(headers);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export async function middleware(request: NextRequest) {
  const next = (init?: (response: NextResponse) => void) => withSecurity(request, headers => {
    const response = NextResponse.next({ request: { headers } });
    init?.(response);
    return response;
  });
  const redirect = (path: string) => withSecurity(request, () => NextResponse.redirect(new URL(path, request.url)));
  // ERD-AUTH-05 / ERD-SHARE-01: páginas públicas con token en el fragmento. El token es un fragmento (no llega al servidor), pero
  // reforzamos el encabezado para que ni la ruta ni futuras variantes viajen como Referer.
  if (["/restablecer-contrasena", "/invitacion", "/verificar-correo"].includes(request.nextUrl.pathname)) {
    return next(response => {
      response.headers.set("Referrer-Policy", "no-referrer");
      response.headers.set("Cache-Control", "no-store");
    });
  }
  if (!PROTECTED.some(prefix => request.nextUrl.pathname === prefix || request.nextUrl.pathname.startsWith(`${prefix}/`))) return next();
  if (process.env.NEXT_PUBLIC_AUTH_ENABLED !== "true") return next();
  const cookie = request.cookies.get("__Host-erd-access") ?? request.cookies.get("erd-access");
  if (!cookie) return redirect("/login");
  // Only the BFF's own cookies: access, the epoch it is bound to, and the revocation cookie
  // (so a session left over from before a logout is revoked by the probe, not kept alive).
  const prefix = cookie.name.startsWith("__Host-") ? "__Host-" : "";
  const forwarded = [cookie, request.cookies.get(`${prefix}erd-epoch`), request.cookies.get(`${prefix}erd-logout`)].filter(item => item !== undefined);
  const probe = await fetch(new URL("/api/bff/auth/me", request.url), { headers: { cookie: forwarded.map(item => `${item.name}=${item.value}`).join("; ") }, cache: "no-store", redirect: "manual" });
  if (!probe.ok) return redirect("/login");
  return next();
}
// Todas las páginas (no los recursos estáticos, imágenes optimizadas ni el BFF, que responde JSON y trae sus propias cabeceras).
export const config = { matcher: ["/((?!api/|_next/static|_next/image|brand/|favicon.ico).*)"] };
