// Auditoría C-06 / re-auditoría N-1: cabeceras de seguridad de la consola de administración. Misma política que la web
// (apps/web/src/lib/security-headers.ts; `security-headers.test.ts` vigila que no se desvíen), pero más estricta: el panel solo habla
// con su propio BFF del mismo origen, así que no hay origen de API ni de Sentry que autorizar.
export interface CspOptions {
  nonce: string;
  /** `next dev` necesita eval (React Refresh) y WebSocket (HMR); producción no. */
  development: boolean;
}

export function buildCsp({ nonce, development }: CspOptions): string {
  if (!/^[A-Za-z0-9+/=_-]{16,}$/.test(nonce)) throw new Error("CSP nonce inválido");
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", `'nonce-${nonce}'`, ...(development ? ["'unsafe-eval'"] : ["'strict-dynamic'"])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(development ? ["ws:", "wss:"] : [])],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const text = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!development) text.push("upgrade-insecure-requests");
  return text.join("; ");
}

/** Cabeceras que no dependen de la petición. HSTS solo fuera de desarrollo. */
export function staticSecurityHeaders(development: boolean): { key: string; value: string }[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    ...(development ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
  ];
}
