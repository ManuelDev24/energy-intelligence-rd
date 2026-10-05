import { NextResponse } from "next/server";
import { z } from "zod";
import { HomeSchema, ContractInSchema, ContractOutSchema, BillSchema, DashboardSchema, EquipmentSchema, EquipmentEstimateSchema, AlertItemSchema, BillCreateSchema, BillUpdateSchema, EquipmentInSchema, AlertStatusUpdateSchema, UserOutSchema, TokensOutSchema, ReadingSchema, ConsumptionSchema, GoalSchema, GoalOrNullSchema, GoalProgressSchema, TariffSchema, BillItemsOutSchema, BillAssessmentSchema, RegisterInSchema, AccountDeletionInSchema, LegalOutSchema, PasswordForgotInSchema, PasswordForgotAcceptedSchema, PasswordResetInSchema } from "@energyrd/api-contracts";

export interface BffConfig { enabled: boolean; apiBase: string; origin: string; secure: boolean }
export function readBffConfig(source: Record<string, string | undefined> = process.env): BffConfig {
  const development = source.NODE_ENV === "development" || source.NODE_ENV === "test";
  if (source.NEXT_PUBLIC_AUTH_ENABLED && !["true", "false"].includes(source.NEXT_PUBLIC_AUTH_ENABLED)) throw new Error("NEXT_PUBLIC_AUTH_ENABLED must be true or false");
  const enabled = source.NEXT_PUBLIC_AUTH_ENABLED === "true";
  if (!enabled && !development) throw new Error("Development pilot authentication must not run in production");
  const api = new URL(source.API_BASE_URL || (development ? "http://localhost:8000" : ""));
  const origin = new URL(source.WEB_ORIGIN || (development ? "http://localhost:3000" : ""));
  for (const url of [api, origin]) {
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || !["http:", "https:"].includes(url.protocol)) throw new Error("Only credential-free HTTP origins are allowed");
    if (!development && url.protocol !== "https:") throw new Error("Production requires HTTPS API_BASE_URL and WEB_ORIGIN");
  }
  return { enabled, apiBase: api.origin, origin: origin.origin, secure: !development || origin.protocol === "https:" };
}
const UserSchema = UserOutSchema;
const PairSchema = TokensOutSchema.extend({ access_token: z.string().min(1).max(4096).regex(/^[A-Za-z0-9._~-]+$/), refresh_token: z.string().min(1).max(4096).regex(/^[A-Za-z0-9._~-]+$/), expires_in: z.number().int().min(1).max(900) });
const CredentialSchema = z.object({ email: z.string().email().max(254), password: z.string().min(12).max(128) }).strict();
// ERD-AUTH-03: el registro exige accept_terms === true literal (nunca un string/1) y nunca admite
// una versión de términos elegida por el cliente: la fija el servidor. El formato de correo se
// valida igual que en login.
const RegisterSchema = RegisterInSchema.extend({ email: z.string().email().max(254) }).strict();
const AccountDeletionSchema = AccountDeletionInSchema.strict();
// ERD-AUTH-05: recuperación de contraseña. Rutas públicas (sin sesión ni Authorization) que no emiten
// cookies de sesión, así que no necesitan el apretón de manos de época; sí conservan Origin/CSRF/JSON.
// El token solo viaja en el cuerpo JSON (nunca en la URL de la API) y tiene exactamente 43 caracteres
// base64url, igual que el contrato.
const FORGOT = "/auth/password/forgot";
const RESET = "/auth/password/reset";
const ForgotSchema = PasswordForgotInSchema.extend({ email: z.string().email().max(254) }).strict();
const ResetSchema = PasswordResetInSchema.strict();
const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const accessName = (config: BffConfig) => config.secure ? "__Host-erd-access" : "erd-access";
const logoutName = (config: BffConfig) => config.secure ? "__Host-erd-logout" : "erd-logout";
// Per-browser auth epoch: rotated by every logout. Session cookies are bound to the epoch that was
// current when their login *request* was sent, so a login whose Set-Cookie lands after a logout
// (aborting fetch cannot stop it) carries a dead epoch: it is rejected and revoked on first use.
const epochName = (config: BffConfig) => config.secure ? "__Host-erd-epoch" : "erd-epoch";
const EPOCH = /^[0-9a-f]{32}$/;
const EPOCH_MAX_AGE = 400 * 24 * 60 * 60;
function cookie(request: Request, name: string) {
  const parts = (request.headers.get("cookie") || "").split(";").map(part => part.trim().split("="));
  const matches = parts.filter(([key]) => key === name);
  return matches.length === 1 && /^[A-Za-z0-9._~-]{1,4160}$/.test(matches[0][1] || "") ? matches[0][1] : undefined;
}
function bound(request: Request, name: string) {
  const value = cookie(request, name);
  const at = value?.indexOf("~") ?? -1;
  if (!value) return undefined;
  // Unbound (pre-epoch) cookies are never accepted as a session, only revoked.
  return at > 0 && EPOCH.test(value.slice(0, at)) && at < value.length - 1 ? { epoch: value.slice(0, at), token: value.slice(at + 1) } : { epoch: undefined, token: value };
}
function setEpoch(response: NextResponse, config: BffConfig) {
  response.cookies.set(epochName(config), crypto.randomUUID().replace(/-/g, ""), { httpOnly: true, secure: config.secure, sameSite: "strict", path: "/", maxAge: EPOCH_MAX_AGE });
  return response;
}
function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, private", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" } });
}
function clear(response: NextResponse, config: BffConfig) {
  for (const name of [accessName(config), logoutName(config)]) response.cookies.set(name, "", { httpOnly: true, secure: config.secure, sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
// ---------- Fase 2 (ERD-CONS-01 / ERD-GOAL-01): lecturas, consumo, meta, progreso, tarifas ----------
// Cada ruta declara método, patrón, respuesta, cuerpo y consulta EXACTOS: un parámetro no declarado,
// repetido o mal formado es 400 y un cuerpo no estricto es 422, siempre antes de contactar la API.
type QueryRule = { pattern: (value: string) => boolean; required?: boolean };
interface Phase2Route { response: z.ZodTypeAny; body?: z.ZodTypeAny; query: Record<string, QueryRule> }
const isoDate = (value: string) => z.string().date().safeParse(value).success;
const PAGE: Record<string, QueryRule> = { limit: { pattern: v => /^\d{1,3}$/.test(v) }, offset: { pattern: v => /^\d{1,6}$/.test(v) } };
// Decimal canónico como texto (≤ 10 enteros, ≤ 2 decimales), sin signo: igual que la API (Numeric(12,2)).
const DECIMAL = /^\d{1,10}(?:\.\d{1,2})?$/;
const decimalText = z.string().regex(DECIMAL);
const positiveText = decimalText.refine(value => Number(value) > 0);
const ReadingWrite = z.object({ read_at: z.string().max(40).datetime({ offset: true }), reading_kwh: decimalText, note: z.string().max(255).nullable().optional() }).strict();
const GoalWrite = z.object({ monthly_amount_rd: positiveText.nullable().optional(), monthly_kwh: positiveText.nullable().optional() }).strict()
  .refine(goal => (goal.monthly_amount_rd ?? null) !== null || (goal.monthly_kwh ?? null) !== null, { message: "goal_required" });
// ERD-BILL-02: detalle de cargos y revisión de consistencia (solo lectura). Igual que la API:
// etiqueta 1..200 no en blanco, cargo ≥ 0, descuento ≤ 0, texto decimal con ≤ 10 enteros y ≤ 2
// decimales, máx. 100 ítems; sin `position`/`source`/`bill_id` del cliente. Validate: cuerpo `{}`.
const CHARGE = /^\d{1,10}(?:\.\d{1,2})?$/;
const DISCOUNT = /^(?:-\d{1,10}(?:\.\d{1,2})?|0{1,10}(?:\.0{1,2})?)$/;
const BillItemWrite = z.object({
  label: z.string().min(1).max(200).refine(value => value.trim().length > 0),
  kind: z.enum(["charge", "discount"]),
  amount_dop: z.string(),
}).strict().refine(item => (item.kind === "charge" ? CHARGE : DISCOUNT).test(item.amount_dop), { path: ["amount_dop"] });
const BillItemsWrite = z.object({ items: z.array(BillItemWrite).max(100) }).strict();
function billDetailRoute(path: string, method: string): Phase2Route | null {
  const match = path.match(new RegExp(`^/homes/${UUID}/bills/${UUID}/(items|validate)$`));
  if (!match) return null;
  if (match[1] === "validate") return method === "POST" ? { response: BillAssessmentSchema, body: z.object({}).strict(), query: {} } : null;
  return method === "GET" ? { response: BillItemsOutSchema, query: {} } : method === "PUT" ? { response: BillItemsOutSchema, body: BillItemsWrite, query: {} } : null;
}
/** La respuesta debe pertenecer a la vivienda y la factura de la ruta (también el detalle anidado). */
function ownsBill(path: string, value: unknown) {
  const [, , home, , bill] = path.split("/");
  const owns = (v: unknown) => !!v && typeof v === "object" && (v as { home_id?: unknown }).home_id === home && (v as { bill_id?: unknown }).bill_id === bill;
  const nested = (value as { detail?: unknown }).detail;
  return owns(value) && (nested === undefined || owns(nested));
}
function phase2Route(path: string, method: string): Phase2Route | null {
  const bill = billDetailRoute(path, method);
  if (bill || new RegExp(`^/homes/${UUID}/bills/${UUID}/(items|validate)$`).test(path)) return bill;
  if (new RegExp(`^/homes/${UUID}/contract$`).test(path)) return method === "GET" ? { response: ContractOutSchema, query: {} } : method === "PUT" ? { response: ContractOutSchema, body: ContractInSchema.strict(), query: {} } : null;
  if (path === "/tariffs") return method === "GET" ? { response: TariffSchema.array(), query: { distributor: { pattern: v => ["EDESUR", "EDENORTE", "EDEESTE"].includes(v) }, on: { pattern: isoDate }, ...PAGE } } : null;
  const match = path.match(new RegExp(`^/homes/${UUID}/(readings|consumption|goal)(?:/(${UUID}|progress))?$`));
  if (!match) return null;
  const [, kind, child] = match;
  if (kind === "readings") {
    if (!child) return method === "GET" ? { response: ReadingSchema.array(), query: PAGE } : method === "POST" ? { response: ReadingSchema, body: ReadingWrite, query: {} } : null;
    return child !== "progress" && method === "DELETE" ? { response: z.undefined(), body: z.object({}).strict(), query: {} } : null;
  }
  if (kind === "consumption") return !child && method === "GET" ? { response: ConsumptionSchema, query: { granularity: { pattern: v => ["day", "week", "month"].includes(v), required: true }, from: { pattern: isoDate, required: true }, to: { pattern: isoDate, required: true } } } : null;
  if (child === "progress") return method === "GET" ? { response: GoalProgressSchema, query: { on: { pattern: isoDate } } } : null;
  if (child) return null;
  return method === "GET" ? { response: GoalOrNullSchema, query: {} } : method === "PUT" ? { response: GoalSchema, body: GoalWrite, query: {} } : null;
}
function phase2QueryOk(route: Phase2Route, params: URLSearchParams) {
  for (const key of new Set(params.keys())) {
    const rule = Object.hasOwn(route.query, key) ? route.query[key] : undefined;
    const values = params.getAll(key);
    if (!rule || values.length !== 1 || !rule.pattern(values[0])) return false;
  }
  return Object.entries(route.query).every(([key, rule]) => !rule.required || params.has(key));
}
function domainRoute(path: string, method: string): z.ZodTypeAny | null {
  const list = method === "GET";
  if (path === "/homes" && ["GET", "POST"].includes(method)) return list ? HomeSchema.array() : HomeSchema;
  if (new RegExp(`^/homes/${UUID}$`).test(path) && ["GET", "PATCH", "DELETE"].includes(method)) return method === "DELETE" ? z.undefined() : HomeSchema;
  const match = path.match(new RegExp(`^/homes/${UUID}/(bills|equipment|alerts|dashboard)(?:/(${UUID}|estimate))?$`));
  if (!match) return null;
  const [, kind, child] = match;
  if (kind === "dashboard") return !child && list ? DashboardSchema : null;
  if (kind === "equipment" && child === "estimate") return list ? EquipmentEstimateSchema : null;
  if (child === "estimate") return null;
  if (kind === "alerts") return !child && list ? AlertItemSchema.array() : child && method === "PATCH" ? AlertItemSchema : null;
  const schema = kind === "bills" ? BillSchema : EquipmentSchema;
  if (!child) return list ? schema.array() : method === "POST" ? schema : null;
  return ["GET", "PUT", "DELETE"].includes(method) ? method === "DELETE" ? z.undefined() : schema : null;
}
const HomeInput = z.object({ name: z.string().min(1).max(120), distributor: HomeSchema.shape.distributor, code: z.string().min(1).max(32).regex(/^[A-Za-z0-9_-]+$/).nullable().optional(), address: z.string().max(255).nullable().optional(), city: z.string().max(120).nullable().optional(), province: z.string().min(1).max(120).nullable().optional(), municipality: z.string().min(1).max(120).nullable().optional(), sector: z.string().min(1).max(120).nullable().optional(), user_type: z.string().min(1).max(120).nullable().optional(), occupants: z.number().int().min(1).max(999).nullable().optional(), has_ac: z.boolean().nullable().optional(), has_water_heater: z.boolean().nullable().optional(), has_pool: z.boolean().nullable().optional(), has_solar: z.boolean().nullable().optional(), has_inverter: z.boolean().nullable().optional() }).strict();
function writeSchema(path: string, method: string) {
  if (method === "DELETE") return z.object({}).strict();
  if (path === "/homes") return HomeInput;
  if (new RegExp(`^/homes/${UUID}$`).test(path)) return HomeInput.omit({ code: true }).partial().strict();
  if (path.includes("/bills")) return method === "POST" ? BillCreateSchema.strict() : BillUpdateSchema.strict();
  if (path.includes("/equipment")) return EquipmentInSchema.strict();
  return AlertStatusUpdateSchema.strict();
}
// Upstream error text (detail/msg) is never forwarded: only local Spanish messages chosen by
// status, path and an allowlisted field table. Unknown fields are dropped, not echoed.
const FIELD_MESSAGES: Record<string, string> = {
  email: "Introduce un correo electrónico válido.",
  password: "La contraseña debe tener entre 12 y 128 caracteres.",
  name: "Revisa el nombre (obligatorio, máximo 120 caracteres).",
  distributor: "Selecciona una distribuidora válida.",
  code: "Revisa el código (letras, números, guion o guion bajo).",
  address: "Revisa la dirección (máximo 255 caracteres).",
  city: "Revisa la ciudad (máximo 120 caracteres).",
  province: "Revisa la provincia (máximo 120 caracteres).",
  municipality: "Revisa el municipio (máximo 120 caracteres).",
  sector: "Revisa el sector (máximo 120 caracteres).",
  user_type: "Revisa el tipo de usuario (máximo 120 caracteres).",
  occupants: "Introduce un número de ocupantes entre 1 y 999.",
  has_ac: "Revisa si tienes aire acondicionado.",
  has_water_heater: "Revisa si tienes calentador de agua.",
  has_pool: "Revisa si tienes piscina.",
  has_solar: "Revisa si tienes paneles solares.",
  has_inverter: "Revisa si tienes inversor.",
  account_number: "Revisa el número de cuenta (máximo 120 caracteres).",
  period_start: "Revisa la fecha de inicio del período.",
  period_end: "Revisa la fecha de fin del período.",
  kwh: "Introduce un consumo en kWh válido.",
  amount_dop: "Introduce un monto en RD$ válido.",
  days: "Introduce un número de días válido (0 a 366).",
  reading_previous: "Revisa la lectura anterior del medidor.",
  reading_current: "Revisa la lectura actual del medidor.",
  source: "Origen de la factura no válido.",
  room: "Revisa la habitación (máximo 80 caracteres).",
  power_w: "Introduce una potencia en vatios válida.",
  hours_per_day: "Introduce horas de uso por día válidas.",
  status: "Estado de alerta no válido.",
  warning_pct: "Revisa el umbral de advertencia.",
  critical_pct: "Revisa el umbral crítico.",
  read_at: "Revisa la fecha y hora de la lectura (no puede ser futura).",
  reading_kwh: "Introduce la lectura del medidor en kWh (0 o más, hasta 2 decimales).",
  note: "La nota admite como máximo 255 caracteres.",
  monthly_amount_rd: "Introduce una meta en RD$ mayor que 0, con hasta 2 decimales.",
  monthly_kwh: "Introduce una meta en kWh mayor que 0, con hasta 2 decimales.",
  label: "Revisa el concepto (obligatorio, máximo 200 caracteres).",
  kind: "Selecciona cargo o descuento.",
  items: "Revisa los conceptos (máximo 100).",
  accept_terms: "Debes aceptar los términos y la política de privacidad.",
  token: "El enlace de recuperación no es válido o caducó. Solicita uno nuevo.",
  new_password: "La contraseña debe tener entre 12 y 128 caracteres.",
};
const SAFE_CODE = /^(?:validation_error|conflict|not_found|invalid_input|reset_token_invalid|http_[1-5]\d\d)$/;
const SAFE_REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/;
function statusMessage(status: number, path: string, code?: unknown) {
  // ERD-AUTH-03: eliminación de cuenta (contraseña incorrecta / propiedad compartida pendiente).
  // ERD-AUTH-05: token de recuperación inválido, caducado o ya usado (sin distinguir cuál).
  if (status === 400 && code === "reset_token_invalid") return "El enlace de recuperación no es válido o caducó. Solicita uno nuevo.";
  if (status === 429 && (path === FORGOT || path === RESET)) return "Demasiadas solicitudes de recuperación. Espera unos minutos e inténtalo de nuevo.";
  if (status === 403 && code === "reauthentication_failed") return "La contraseña no es correcta.";
  if (status === 409 && code === "ownership_transfer_required") return "No puedes eliminar la cuenta: eres el único propietario de una vivienda compartida. Transfiere la propiedad antes de continuar (todavía no existe una función para transferirla).";
  // Fase 2: mensajes propios por ruta (el texto de la API nunca se reenvía).
  if (status === 409 && /\/readings$/.test(path)) return "Ya existe una lectura con esa fecha y hora.";
  if (status === 422 && code === "invalid_input" && /\/readings$/.test(path)) return "La lectura debe ser mayor o igual que la anterior y menor o igual que la siguiente.";
  if (status === 422 && code === "invalid_input" && /\/consumption$/.test(path)) return "Rango de fechas inválido: máximo 366 días.";
  if (status === 401) return path === "/auth/login" ? "Credenciales inválidas." : "La sesión venció. Inicia sesión de nuevo.";
  if (status === 409) return path === "/auth/register" ? "Ya existe una cuenta con este correo electrónico." : path.includes("/bills") ? "Registro duplicado o período solapado con otra factura de esta vivienda." : "La operación entra en conflicto con datos existentes.";
  if (status === 422) return "Datos inválidos. Revisa los campos marcados.";
  if (status === 404) return "No encontrado o sin acceso.";
  if (status === 403) return "No tienes permiso para esta operación.";
  if (status === 429) return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
  if (status === 400) return "Solicitud inválida.";
  if (status >= 500) return "Error del servidor. Inténtalo de nuevo más tarde.";
  return "No se pudo completar la solicitud.";
}
function fieldIssues(issues: { path?: readonly PropertyKey[]; loc?: readonly unknown[] }[]) {
  const seen = new Set<string>();
  const out: { loc: string[]; msg: string }[] = [];
  for (const issue of issues) {
    const field = (issue.loc ?? issue.path ?? []).at(-1);
    if (typeof field !== "string" || !Object.hasOwn(FIELD_MESSAGES, field) || seen.has(field)) continue;
    seen.add(field); out.push({ loc: ["body", field], msg: FIELD_MESSAGES[field] });
  }
  return out;
}
function invalid(issues: z.ZodIssue[]) {
  const fields = fieldIssues(issues);
  return reply({ detail: fields.length ? fields : statusMessage(422, ""), code: "validation_error" }, 422);
}
function safeError(body: unknown, status: number, path: string) {
  const parsed = z.object({ detail: z.unknown().optional(), code: z.unknown().optional(), request_id: z.unknown().optional() }).safeParse(body);
  const value = parsed.success ? parsed.data : {};
  const issues = z.array(z.object({ loc: z.array(z.unknown()).optional() })).safeParse(value.detail);
  const fields = status === 422 && issues.success ? fieldIssues(issues.data) : [];
  return {
    detail: fields.length ? fields : statusMessage(status, path, value.code),
    ...(typeof value.code === "string" && SAFE_CODE.test(value.code) ? { code: value.code } : {}),
    ...(typeof value.request_id === "string" && SAFE_REQUEST_ID.test(value.request_id) ? { request_id: value.request_id } : {}),
  };
}
/** Server-only boundary. No refresh endpoint: expiry always requires a fresh login. */
export async function handleBff(request: Request, config: BffConfig, fetchImpl: typeof fetch = fetch): Promise<NextResponse> {
  if (!config.enabled) return reply({ detail: "Autenticación no disponible en el piloto local." }, 404);
  const url = new URL(request.url);
  const path = url.pathname.slice("/api/bff".length);
  const method = request.method;
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) return reply({ detail: "Método no permitido." }, 405);
  if (method !== "GET") {
    if (request.headers.get("origin") !== config.origin || (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")) return reply({ detail: "Origen no permitido." }, 403);
    if (!(request.headers.get("content-type") || "").match(/^application\/json(?:;|$)/i)) return reply({ detail: "Se requiere JSON." }, 415);
  }
  const auth = ["/auth/login", "/auth/register", "/auth/logout"].includes(path) && method === "POST" || path === "/auth/me" && (method === "GET" || method === "DELETE");
  const legal = path === "/legal" && method === "GET";
  const recovery = method === "POST" && (path === FORGOT || path === RESET);
  const phase2 = auth || legal || recovery ? null : phase2Route(path, method);
  const schema = legal ? LegalOutSchema : phase2 ? phase2.response : domainRoute(path, method);
  if (!auth && !legal && !recovery && !schema) return reply({ detail: "Ruta no permitida." }, 404);
  if (new RegExp(`^/homes/${UUID}$`).test(path) && url.search) return reply({ detail: "Consulta no permitida." }, 400);
  if (phase2 && !phase2QueryOk(phase2, url.searchParams)) return reply({ detail: "Consulta no permitida." }, 400);
  if (!phase2 && !legal) for (const [key, value] of url.searchParams) {
    if (auth || recovery || !["limit", "offset", "include_dismissed"].includes(key) || (key === "include_dismissed" ? !["true", "false"].includes(value) : !/^\d{1,6}$/.test(value)) || url.searchParams.getAll(key).length !== 1) return reply({ detail: "Consulta no permitida." }, 400);
  }
  if (legal && url.search) return reply({ detail: "Consulta no permitida." }, 400);
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: string | undefined;
  const logout = path === "/auth/logout";
  const deleteAccount = path === "/auth/me" && method === "DELETE";
  if (method !== "GET") {
    try {
      const text = await request.text();
      if (text.length > 32_768) return reply({ detail: "Solicitud demasiado grande." }, 413);
      const value = JSON.parse(text || "{}");
      if (path === "/auth/login" || path === "/auth/register") {
        const credentials = (path === "/auth/register" ? RegisterSchema : CredentialSchema).safeParse(value);
        if (!credentials.success) return invalid(credentials.error.issues);
        if (!EPOCH.test(cookie(request, epochName(config)) || "")) return setEpoch(reply({ detail: "Activa las cookies de este sitio e inténtalo de nuevo.", code: "auth_epoch_required" }, 428), config);
        body = JSON.stringify(credentials.data);
      } else if (recovery) {
        const parsed = (path === RESET ? ResetSchema : ForgotSchema).safeParse(value);
        if (!parsed.success) return invalid(parsed.error.issues);
        body = JSON.stringify(parsed.data);
      } else if (logout) {
        if (Object.keys(value).length) return reply({ detail: "No se aceptan credenciales del navegador." }, 422);
        const token = bound(request, logoutName(config))?.token;
        if (!token) return setEpoch(clear(reply({ ok: true }), config), config);
        body = JSON.stringify({ refresh_token: token });
      } else if (deleteAccount) {
        const parsed = AccountDeletionSchema.safeParse(value);
        if (!parsed.success) return invalid(parsed.error.issues);
        body = JSON.stringify(parsed.data);
      } else {
        const parsed = (phase2 ? phase2.body ?? z.object({}).strict() : writeSchema(path, method)).safeParse(value);
        if (!parsed.success) return invalid(parsed.error.issues);
        body = method === "DELETE" ? undefined : JSON.stringify(parsed.data);
      }
      headers["Content-Type"] = "application/json";
    } catch { return reply({ detail: "JSON inválido." }, 400); }
  }
  if ((!auth || path === "/auth/me") && !legal && !recovery) {
    const epoch = cookie(request, epochName(config));
    const access = bound(request, accessName(config));
    const refresh = bound(request, logoutName(config));
    const expired = () => reply({ detail: "La sesión venció. Inicia sesión de nuevo.", code: "http_401" }, 401);
    if (refresh && (!epoch || refresh.epoch !== epoch)) {
      // A session from before the latest logout must not stay alive server-side: revoke it.
      // Cookies are not cleared here (reads never clear; a late clear could erase a newer login).
      try { await fetchImpl(`${config.apiBase}/api/v1/auth/logout`, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: refresh.token }), redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(10_000) }); }
      catch { /* Revocation is retried on the next request that still carries the stale cookie. */ }
      return expired();
    }
    if (!access || !epoch || access.epoch !== epoch) return expired();
    headers.Authorization = `Bearer ${access.token}`;
  }
  try {
    const upstream = await fetchImpl(`${config.apiBase}/api/v1${path}${url.search}`, { method, headers, body, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (upstream.status >= 300 && upstream.status < 400) throw new Error("Redirect rejected");
    const data: unknown = upstream.status === 204 ? undefined : await upstream.json();
    if (logout) return setEpoch(clear(reply(upstream.ok ? { ok: true } : safeError(data, upstream.status, path), upstream.ok ? 200 : upstream.status), config), config);
    if (!upstream.ok) {
      // Reads must not clear cookies: a late 401 could otherwise erase a new login.
      const response = reply(safeError(data, upstream.status, path), upstream.status);
      // Allow only delta-seconds within the API's maximum auth window (86400s).
      // Never forward arbitrary upstream headers, cookie values or HTTP-date text.
      const retryAfter = upstream.headers.get("Retry-After");
      if (upstream.status === 429 && retryAfter && /^[1-9]\d{0,4}$/.test(retryAfter) && Number(retryAfter) <= 86400) {
        response.headers.set("Retry-After", retryAfter);
      }
      return response;
    }
    if (path === FORGOT) {
      // Siempre 202 {status:"accepted"} (sin enumeración); cualquier otra forma es un error de contrato.
      if (upstream.status !== 202) throw new Error("Unexpected status");
      return reply(PasswordForgotAcceptedSchema.strict().parse(data), 202);
    }
    if (path === RESET) {
      if (upstream.status !== 204) throw new Error("Unexpected status");
      // Public reset revokes only the token owner's sessions in the API. A late response
      // must never erase cookies belonging to a newer login (possibly another account).
      // Revoked sessions are rejected by the normal 401 path; no second logout write.
      return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store, private", "Vary": "Cookie" } });
    }
    if (path === "/auth/login" || path === "/auth/register") {
      const pair = PairSchema.parse(data);
      const response = reply({ ok: true }, upstream.status);
      const options = { httpOnly: true, secure: config.secure, sameSite: "strict" as const, path: "/" };
      const epoch = cookie(request, epochName(config))!;
      response.cookies.set(accessName(config), `${epoch}~${pair.access_token}`, { ...options, maxAge: pair.expires_in });
      // This session cookie is only used for revocation, never rotation.
      response.cookies.set(logoutName(config), `${epoch}~${pair.refresh_token}`, options);
      return response;
    }
    const parsed = upstream.status === 204 && method === "DELETE" ? undefined : (legal ? LegalOutSchema : path === "/auth/me" ? UserSchema : schema!).parse(data);
    if (parsed !== undefined && phase2 && new RegExp(`^/homes/${UUID}/bills/${UUID}/(items|validate)$`).test(path) && !ownsBill(path, parsed)) throw new Error("Mismatched bill");
    if (parsed !== undefined && phase2 && /\/contract$/.test(path) && (parsed as { home_id: string }).home_id !== path.split("/")[2]) throw new Error("Mismatched home");
    if (parsed !== undefined && new RegExp(`^/homes/${UUID}$`).test(path) && (parsed as { id: string }).id !== path.split("/")[2]) throw new Error("Mismatched home");
    if (parsed === undefined) {
      const response = new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
      return deleteAccount ? setEpoch(clear(response, config), config) : response;
    }
    return reply(parsed, upstream.status);
  } catch {
    const response = reply({ detail: "No se pudo confirmar la respuesta de la API. No se reintentó la operación." }, 502);
    return logout ? setEpoch(clear(response, config), config) : response;
  }
}
