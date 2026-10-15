// ERD-OBS-01: redacción de datos personales ANTES de que un evento salga del dispositivo. Mismas reglas que
// `backend/api/app/telemetry.py` (web y móvil comparten este módulo). Puro: sin SDK, sin red.
// Qué nunca sale: cuerpos, cookies, cabeceras (salvo User-Agent y X-Request-ID), query string, IP, usuario, nombre del servidor,
// variables locales y líneas de código de los frames, correos, JWT, `Bearer …`, tokens opacos de 43 caracteres, ni valores bajo
// claves sensibles (password, token, email, cuenta, dirección, texto OCR…).

export const FILTERED = '[Filtered]';
const KEEP_HEADERS = new Set(['user-agent', 'x-request-id']);
const SENSITIVE_KEY =
  /pass(word|wd)|token|secret|authorization|cookie|api[-_]?key|dsn|signature|session|csrf|email|correo|account_number|cuenta|nic\b|address|direccion|dirección|raw_text|excerpt|client[-_]?ip|ip_address/i;
const PATTERNS = [
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g,
  /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g,
];
const DROPPED_KEYS = new Set(['vars', 'pre_context', 'context_line', 'post_context']);
const SCRUBBED_SECTIONS = ['message', 'logentry', 'exception', 'breadcrumbs', 'extra', 'contexts', 'tags', 'spans', 'measurements'];

export function scrubText(value: string): string {
  return PATTERNS.reduce((text, pattern) => text.replace(pattern, FILTERED), value);
}

export function scrubValue(value: unknown): unknown {
  if (typeof value === 'string') return scrubText(value);
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !DROPPED_KEYS.has(key))
        .map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? FILTERED : scrubValue(item)]),
    );
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) return value;
  return FILTERED; // funciones, símbolos, objetos exóticos: no se serializan
}

function cleanUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return scrubText(url.split(/[?#]/)[0] ?? '');
  }
}

function cleanRequest(request: unknown): Record<string, unknown> | undefined {
  if (!request || typeof request !== 'object') return undefined;
  const source = request as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  if (typeof source.url === 'string') clean.url = cleanUrl(source.url);
  if (typeof source.method === 'string') clean.method = source.method;
  if (source.headers && typeof source.headers === 'object') {
    const kept = Object.fromEntries(Object.entries(source.headers as Record<string, unknown>).filter(([k]) => KEEP_HEADERS.has(k.toLowerCase())));
    if (Object.keys(kept).length) clean.headers = scrubValue(kept);
  }
  return Object.keys(clean).length ? clean : undefined;
}

/** `beforeSend` / `beforeSendTransaction`. Nunca lanza: ante un fallo devuelve un evento mínimo (jamás el original). */
export function scrubSentryEvent<T extends Record<string, unknown>>(event: T): T {
  try {
    const out: Record<string, unknown> = { ...event };
    delete out.user;
    delete out.server_name;
    const request = cleanRequest(out.request);
    if (request) out.request = request;
    else delete out.request;
    for (const section of SCRUBBED_SECTIONS) if (section in out) out[section] = scrubValue(out[section]);
    return out as T;
  } catch {
    return { message: 'scrub_failed', level: (event as { level?: string })?.level ?? 'error' } as unknown as T;
  }
}

/** DSN válido: https, o http solo hacia loopback en desarrollo (para probar con un servidor local). */
export function validDsn(dsn: string | undefined, allowLoopbackHttp = false): string | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol === 'https:' || (allowLoopbackHttp && loopback && url.protocol === 'http:')) return dsn;
  } catch {
    /* DSN mal formado: sin telemetría */
  }
  return null;
}
