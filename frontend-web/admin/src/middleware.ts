import { NextResponse, type NextRequest } from "next/server";
import { buildCsp } from "@/lib/security-headers";

// Re-auditoría N-1: CSP con nonce por petición en toda página de la consola (Next lo aplica a sus scripts en línea al verlo en la
// petición; por eso el layout raíz es dinámico). Las demás cabeceras son estáticas y viven en next.config.mjs.
export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp({ nonce, development: process.env.NODE_ENV !== "production" });
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

// Todas las páginas; no los recursos estáticos ni el BFF (responde JSON y trae sus propias cabeceras).
export const config = { matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"] };
