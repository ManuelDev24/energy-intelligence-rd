// Auditoría C-06: cabeceras de seguridad de la web. Funciones puras (sin Next) para poder probarlas y reutilizarlas en el middleware
// (CSP con nonce por petición) y en next.config.mjs (cabeceras estáticas).
export interface CspOptions {
  nonce: string;
  /** `next dev` necesita eval (React Refresh) y WebSocket (HMR); producción no. */
  development: boolean;
  /** Origen de la API para el modo piloto sin BFF (solo desarrollo); con autenticación todo pasa por el mismo origen. */
  apiOrigin?: string;
  /** DSN público de Sentry (opcional): se autoriza solo su origen de ingesta. */
  sentryDsn?: string;
}

function origin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.hostname ? url.origin : null;
  } catch {
    return null;
  }
}

export function buildCsp({ nonce, development, apiOrigin, sentryDsn }: CspOptions): string {
  if (!/^[A-Za-z0-9+/=_-]{16,}$/.test(nonce)) throw new Error("CSP nonce inválido");
  const connect = ["'self'"];
  const sentry = origin(sentryDsn);
  if (sentry) connect.push(sentry);
  if (development) {
    const api = origin(apiOrigin);
    if (api) connect.push(api);
    connect.push("ws:", "wss:");
  }
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'strict-dynamic' hace que solo confíen los scripts con nonce y los que estos carguen; 'self' queda como respaldo de navegadores antiguos.
    "script-src": ["'self'", `'nonce-${nonce}'`, ...(development ? ["'unsafe-eval'"] : ["'strict-dynamic'"])],
    // Los estilos en línea los emiten React (atributos style) y Recharts; no hay forma práctica de aplicarles nonce.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": connect,
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const text = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  if (!development) text.push("upgrade-insecure-requests");
  return text.join("; ");
}

/** Cabeceras que no dependen de la petición. HSTS solo fuera de desarrollo (en http://localhost sería ruido). */
export function staticSecurityHeaders(development: boolean): { key: string; value: string }[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    ...(development ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
  ];
}
