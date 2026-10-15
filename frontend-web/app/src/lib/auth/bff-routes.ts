// Auditoría C-20: rutas y esquemas estrictos de las peticiones que el BFF acepta (extraído de bff.ts sin cambios de comportamiento).
import { z } from "zod";
import { HomeSchema, ContractInSchema, ContractOutSchema, BillSchema, DashboardSchema, EquipmentSchema, EquipmentEstimateSchema, AlertItemSchema, BillCreateSchema, BillUpdateSchema, EquipmentInSchema, AlertStatusUpdateSchema, ReadingSchema, ConsumptionSchema, GoalSchema, GoalOrNullSchema, GoalProgressSchema, TariffSchema, BillItemsOutSchema, BillAssessmentSchema, EmailVerificationRequestOutSchema, OcrJobSchema, InvitationCreateInSchema, InvitationOutSchema, InvitationAcceptInSchema, MemberOutSchema, OwnershipTransferInSchema, NotificationPreferencesInSchema, NotificationPreferencesOutSchema, SessionOutSchema, AnomaliesSchema, AnomalySchema, AnomalyStatusInSchema, BillPaymentInSchema, RecommendationSchema, RecommendationListSchema, RecommendationStatusInSchema, GoalProposalOutSchema, EnergyReportOutSchema, DownloadUrlOutSchema, HelpIndexSchema, HelpArticleSchema, ClaimInSchema, ClaimNoteInSchema, ClaimCloseInSchema, ClaimReferenceInSchema, ClaimOutSchema, ClaimDetailOutSchema, EnergyScoreSchema, OutageSchema, OutagesSchema, OutageSummarySchema, OutageInSchema, ConversationInSchema, ConversationOutSchema, ConversationRenameSchema, CopilotMessageOutSchema, CopilotUsageOutSchema, FeedbackInSchema, MessageInSchema } from "@energyrd/api-contracts";
// Cada ruta declara método, patrón, respuesta, cuerpo y consulta EXACTOS: un parámetro no declarado,
// repetido o mal formado es 400 y un cuerpo no estricto es 422, siempre antes de contactar la API.
export const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
export const ExportSchema = z.object({ format_version: z.literal(1) }).passthrough();
type QueryRule = { pattern: (value: string) => boolean; required?: boolean };
export interface Phase2Route { response: z.ZodTypeAny; body?: z.ZodTypeAny; query: Record<string, QueryRule> }
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
export function ownsBill(path: string, value: unknown) {
  const [, , home, , bill] = path.split("/");
  const owns = (v: unknown) => !!v && typeof v === "object" && (v as { home_id?: unknown }).home_id === home && (v as { bill_id?: unknown }).bill_id === bill;
  const nested = (value as { detail?: unknown }).detail;
  return owns(value) && (nested === undefined || owns(nested));
}
/** ERD-SHARE-01: compartir vivienda. Cuerpos estrictos; el texto de error de la API nunca se reenvía. */
function sharingRoute(path: string, method: string): Phase2Route | null {
  if (path === "/invitations/accept") return method === "POST" ? { response: HomeSchema, body: InvitationAcceptInSchema.strict(), query: {} } : null;
  const match = path.match(new RegExp(`^/homes/${UUID}/(members|invitations|transfer-ownership)(?:/(${UUID}|me))?$`));
  if (!match) return null;
  const [, kind, child] = match;
  const none = z.undefined();
  const empty = z.object({}).strict();
  if (kind === "members") {
    if (!child) return method === "GET" ? { response: MemberOutSchema.array(), query: {} } : null;
    return method === "DELETE" ? { response: none, body: empty, query: {} } : null;
  }
  if (kind === "invitations") {
    if (!child) return method === "GET" ? { response: InvitationOutSchema.array(), query: {} }
      : method === "POST" ? { response: InvitationOutSchema, body: InvitationCreateInSchema.strict(), query: {} } : null;
    return child !== "me" && method === "DELETE" ? { response: none, body: empty, query: {} } : null;
  }
  return !child && method === "POST" ? { response: none, body: OwnershipTransferInSchema.strict(), query: {} } : null;
}
/** ERD-PROF-01: preferencias, sesiones activas y exportación de datos de la cuenta. */
function accountSettingsRoute(path: string, method: string): Phase2Route | null {
  const none = z.undefined();
  if (path === "/auth/me/preferences") return method === "GET" ? { response: NotificationPreferencesOutSchema, query: {} }
    : method === "PUT" ? { response: NotificationPreferencesOutSchema, body: NotificationPreferencesInSchema.strict(), query: {} } : null;
  if (path === "/auth/me/export") return method === "GET" ? { response: ExportSchema, query: {} } : null;
  if (path === "/auth/sessions") return method === "GET" ? { response: SessionOutSchema.array(), query: {} } : null;
  if (path === "/auth/email/verification") return method === "POST" ? { response: EmailVerificationRequestOutSchema, body: z.object({}).strict(), query: {} } : null;
  if (path === "/auth/sessions/revoke-others") return method === "POST" ? { response: none, body: z.object({}).strict(), query: {} } : null;
  if (new RegExp(`^/auth/sessions/${UUID}$`).test(path)) return method === "DELETE" ? { response: none, body: z.object({}).strict(), query: {} } : null;
  return null;
}
/** ERD-AI-CHAT: Energy Copilot. Las conversaciones devueltas deben ser de la vivienda de la ruta (se comprueba en bff.ts). El envío de
 * mensajes (`POST …/messages`) es streaming y se resuelve aparte con `copilotStreamBody`. */
const CopilotPage: Record<string, QueryRule> = {
  limit: { pattern: v => /^\d{1,3}$/.test(v) && Number(v) >= 1 && Number(v) <= 100 }, offset: { pattern: v => /^\d{1,5}$/.test(v) },
};
export const COPILOT_STREAM = new RegExp(`^/homes/${UUID}/copilot/conversations/${UUID}/messages$`);
export const copilotStreamBody = MessageInSchema.strict().refine(m => (m.period_from == null) === (m.period_to == null), { path: ["period_to"] })
  .refine(m => !m.period_from || !m.period_to || m.period_from <= m.period_to, { path: ["period_to"] })
  .refine(m => m.content.trim().length > 0, { path: ["content"] });
function copilotRoute(path: string, method: string): Phase2Route | null {
  const none = z.undefined();
  if (new RegExp(`^/homes/${UUID}/copilot/usage$`).test(path)) return method === "GET" ? { response: CopilotUsageOutSchema, query: {} } : null;
  if (new RegExp(`^/homes/${UUID}/copilot/conversations$`).test(path)) return method === "GET" ? { response: ConversationOutSchema.array(), query: CopilotPage }
    : method === "POST" ? { response: ConversationOutSchema, body: ConversationInSchema.strict(), query: {} } : null;
  if (new RegExp(`^/homes/${UUID}/copilot/conversations/${UUID}$`).test(path)) return method === "PATCH"
    ? { response: ConversationOutSchema, body: ConversationRenameSchema.strict(), query: {} }
    : method === "DELETE" ? { response: none, body: z.object({}).strict(), query: {} } : null;
  if (COPILOT_STREAM.test(path)) return method === "GET" ? { response: CopilotMessageOutSchema.array(), query: {} } : null;
  if (new RegExp(`^/homes/${UUID}/copilot/conversations/${UUID}/messages/${UUID}/feedback$`).test(path)) return method === "PUT"
    ? { response: CopilotMessageOutSchema, body: FeedbackInSchema.strict(), query: {} } : null;
  return null;
}
export function phase2Route(path: string, method: string): Phase2Route | null {
  const copilot = copilotRoute(path, method);
  if (copilot || /\/copilot(\/|$)/.test(path)) return copilot;
  const account = accountSettingsRoute(path, method);
  if (account || /^\/auth\/(sessions|me\/preferences|me\/export)(\/|$)/.test(path)) return account;
  const sharing = sharingRoute(path, method);
  if (sharing || /\/(members|invitations|transfer-ownership)(\/|$)/.test(path)) return sharing;
  if (new RegExp(`^/homes/${UUID}/dashboard$`).test(path)) return method === "GET"
    ? { response: DashboardSchema, query: { bill_id: { pattern: v => z.string().uuid().safeParse(v).success } } }
    : null;
  // ERD-ANOM-01-COMPLETE: lista con filtros cerrados y cambio de estado (el escaneo lo piden las escrituras y el trabajo diario).
  if (new RegExp(`^/homes/${UUID}/anomalies$`).test(path)) return method === "GET" ? { response: AnomaliesSchema, query: {
    status: { pattern: v => ["active", "open", "acknowledged", "dismissed", "resolved", "all"].includes(v) },
    granularity: { pattern: v => ["day", "month", "billing"].includes(v) },
    kind: { pattern: v => ["increase", "drop", "peak", "night"].includes(v) },
    limit: { pattern: v => /^\d{1,3}$/.test(v) && Number(v) >= 1 && Number(v) <= 100 },
  } } : null;
  if (new RegExp(`^/homes/${UUID}/anomalies/${UUID}$`).test(path)) return method === "PATCH" ? { response: AnomalySchema, body: AnomalyStatusInSchema.strict(), query: {} } : null;
  if (/\/anomalies(\/|$)/.test(path)) return null;
  // ERD-INT-01: interrupciones del servicio eléctrico (alta, historial, edición, baja y resumen mensual).
  if (new RegExp(`^/homes/${UUID}/outages$`).test(path)) return method === "GET" ? { response: OutagesSchema, query: PAGE }
    : method === "POST" ? { response: OutageSchema, body: OutageInSchema.strict(), query: {} } : null;
  if (new RegExp(`^/homes/${UUID}/outages/summary$`).test(path)) return method === "GET" ? { response: OutageSummarySchema, query: {
    months: { pattern: v => /^\d{1,2}$/.test(v) && Number(v) >= 1 && Number(v) <= 24 },
  } } : null;
  if (new RegExp(`^/homes/${UUID}/outages/${UUID}$`).test(path)) return method === "GET" ? { response: OutageSchema, query: {} }
    : method === "PUT" ? { response: OutageSchema, body: OutageInSchema.strict(), query: {} }
    : method === "DELETE" ? { response: z.undefined(), body: z.object({}).strict(), query: {} } : null;
  if (/\/outages(\/|$)/.test(path)) return null;
  // ERD-SCORE-01: Energy Score (solo lectura, sin parámetros).
  if (new RegExp(`^/homes/${UUID}/energy-score$`).test(path)) return method === "GET" ? { response: EnergyScoreSchema, query: {} } : null;
  if (/\/energy-score(\/|$)/.test(path)) return null;
  // ERD-CLAIM-01: reclamaciones. Cuerpos estrictos; el filtro de estado es cerrado.
  if (new RegExp(`^/homes/${UUID}/claims$`).test(path)) return method === "GET" ? { response: ClaimOutSchema.array(), query: { status: { pattern: v => ["open", "in_review", "resolved", "closed"].includes(v) } } }
    : method === "POST" ? { response: ClaimDetailOutSchema, body: ClaimInSchema.strict(), query: {} } : null;
  if (new RegExp(`^/homes/${UUID}/claims/${UUID}$`).test(path)) return method === "GET" ? { response: ClaimDetailOutSchema, query: {} } : null;
  if (new RegExp(`^/homes/${UUID}/claims/${UUID}/notes$`).test(path)) return method === "POST" ? { response: ClaimDetailOutSchema, body: ClaimNoteInSchema.strict(), query: {} } : null;
  if (new RegExp(`^/homes/${UUID}/claims/${UUID}/reference$`).test(path)) return method === "PUT" ? { response: ClaimDetailOutSchema, body: ClaimReferenceInSchema.strict(), query: {} } : null;
  if (new RegExp(`^/homes/${UUID}/claims/${UUID}/close$`).test(path)) return method === "POST" ? { response: ClaimDetailOutSchema, body: ClaimCloseInSchema.strict(), query: {} } : null;
  if (/\/claims(\/|$)/.test(path)) return null;
  // ERD-HELP-01: centro de ayuda (contenido editorial; solo lectura con búsqueda y categoría acotadas).
  if (path === "/help") return method === "GET" ? { response: HelpIndexSchema, query: { q: { pattern: v => v.length <= 80 }, category: { pattern: v => /^[a-z-]{1,40}$/.test(v) } } } : null;
  if (/^\/help\/articles\/[a-z0-9-]{1,64}$/.test(path)) return method === "GET" ? { response: HelpArticleSchema, query: {} } : null;
  if (/^\/help(\/|$)/.test(path)) return null;
  // ERD-RPT-01: informe energético (solo lectura; fechas opcionales AAAA-MM-DD).
  if (new RegExp(`^/homes/${UUID}/reports/energy$`).test(path)) return method === "GET" ? { response: EnergyReportOutSchema, query: { from: { pattern: isoDate }, to: { pattern: isoDate } } } : null;
  // PDF del informe: el BFF lo reenvía como bytes (rama `pdf` en bff.ts); el enlace firmado es para clientes sin sesión de cookies.
  if (new RegExp(`^/homes/${UUID}/reports/energy\\.pdf$`).test(path)) return method === "GET" ? { response: z.unknown(), query: { from: { pattern: isoDate }, to: { pattern: isoDate } } } : null;
  if (new RegExp(`^/homes/${UUID}/reports/energy/pdf-link$`).test(path)) return method === "POST" ? { response: DownloadUrlOutSchema, body: z.object({}).strict(), query: { from: { pattern: isoDate }, to: { pattern: isoDate } } } : null;
  if (/\/reports(\/|$)/.test(path)) return null;
  // ERD-SAVE-01: recomendaciones de ahorro. Lista con filtros cerrados, recálculo (cuerpo vacío) y cambio de estado.
  if (new RegExp(`^/homes/${UUID}/recommendations$`).test(path)) return method === "GET" ? { response: RecommendationListSchema, query: {
    status: { pattern: v => ["active", "applied", "dismissed", "resolved", "all"].includes(v) },
    limit: { pattern: v => /^\d{1,3}$/.test(v) && Number(v) >= 1 && Number(v) <= 100 },
  } } : null;
  if (new RegExp(`^/homes/${UUID}/recommendations/refresh$`).test(path)) return method === "POST" ? { response: RecommendationListSchema, body: z.object({}).strict(), query: {} } : null;
  // ERD-SAVE-01-CLOSE: meta sugerida (solo lectura) y «Aplicar objetivo» (cuerpo vacío: el servidor recalcula).
  if (new RegExp(`^/homes/${UUID}/recommendations/goal-proposal$`).test(path)) return method === "GET" ? { response: GoalProposalOutSchema, query: {} } : null;
  if (new RegExp(`^/homes/${UUID}/recommendations/goal-proposal/apply$`).test(path)) return method === "POST" ? { response: GoalSchema, body: z.object({}).strict(), query: {} } : null;
  if (new RegExp(`^/homes/${UUID}/recommendations/${UUID}$`).test(path)) return method === "PATCH" ? { response: RecommendationSchema, body: RecommendationStatusInSchema.strict(), query: {} } : null;
  if (/\/recommendations(\/|$)/.test(path)) return null;
  // ERD-ALERT-02: marcar una factura como pagada/pendiente.
  if (new RegExp(`^/homes/${UUID}/bills/${UUID}/payment$`).test(path)) return method === "PUT" ? { response: BillSchema, body: BillPaymentInSchema.strict(), query: {} } : null;
  const job = path.match(new RegExp(`^/homes/${UUID}/bills/ocr-jobs/${UUID}(/retry)?$`));
  if (job) return job[1] ? (method === "POST" ? { response: OcrJobSchema, body: z.object({}).strict(), query: {} } : null)
    : method === "GET" ? { response: OcrJobSchema, query: {} } : null;
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
export function phase2QueryOk(route: Phase2Route, params: URLSearchParams) {
  for (const key of new Set(params.keys())) {
    const rule = Object.hasOwn(route.query, key) ? route.query[key] : undefined;
    const values = params.getAll(key);
    if (!rule || values.length !== 1 || !rule.pattern(values[0])) return false;
  }
  return Object.entries(route.query).every(([key, rule]) => !rule.required || params.has(key));
}
export function domainRoute(path: string, method: string): z.ZodTypeAny | null {
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
export function writeSchema(path: string, method: string) {
  if (method === "DELETE") return z.object({}).strict();
  if (path === "/homes") return HomeInput;
  if (new RegExp(`^/homes/${UUID}$`).test(path)) return HomeInput.omit({ code: true }).partial().strict();
  if (path.includes("/bills")) return method === "POST" ? BillCreateSchema.strict() : BillUpdateSchema.strict();
  if (path.includes("/equipment")) return EquipmentInSchema.strict();
  return AlertStatusUpdateSchema.strict();
}
