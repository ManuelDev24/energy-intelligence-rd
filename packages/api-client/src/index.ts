import { z } from "zod";
import {
  HomeSchema, BillSchema, DashboardSchema, EquipmentSchema, EquipmentEstimateSchema, AlertItemSchema,
  ReadingSchema, ConsumptionSchema, GoalSchema, GoalOrNullSchema, GoalProgressSchema, TariffSchema,
  BillItemsOutSchema, BillAssessmentSchema, AccountDeletionInSchema, LegalOutSchema, RegisterInSchema,
  PasswordForgotInSchema, PasswordForgotAcceptedSchema, PasswordResetInSchema, EmailVerifyInSchema, EmailVerificationRequestOutSchema, OcrJobSchema, AnomalySchema, AnomaliesSchema, RecommendationSchema, RecommendationListSchema, GoalProposalOutSchema, EnergyScoreSchema, OutageSchema, OutageSummarySchema,
  ConversationOutSchema, CopilotMessageOutSchema, CopilotUsageOutSchema,
  type BillInput, type EquipmentInput, type AlertStatus, type ReadingInput, type GoalInput, type Granularity,
  type Distributor, type OutageInput, type BillItemsReplace, type RegisterIn, type Anomaly,
} from "@energyrd/api-contracts";

export class ApiError extends Error {
  constructor(public readonly status: number, message: string,
    public readonly fieldErrors: Record<string, string> = {},
    public readonly code?: string, public readonly requestId?: string) {
    super(message);
    this.name = "ApiError";
  }
  get isNetwork() { return this.status === 0; }
}

export class ContractError extends ApiError {
  constructor() { super(502, "La respuesta del servidor no cumple el contrato", {}, "invalid_response"); }
}

export const retryPolicy = (count: number, error: unknown) =>
  !(error instanceof ContractError || (error instanceof ApiError && error.status >= 400 && error.status < 500)) && count < 1;

export type RecommendationListStatus = "active" | "applied" | "dismissed" | "resolved" | "all";
export type AnomalyListStatus = "active" | "open" | "acknowledged" | "dismissed" | "resolved" | "all";
export type BillImage = { uri: string; name?: string; type?: string };

export function parseErrorBody(status: number, body: unknown): ApiError {
  const parsed = z.object({ detail: z.unknown().optional(), code: z.string().optional(), request_id: z.string().optional() }).safeParse(body);
  const value = parsed.success ? parsed.data : {};
  const fields: Record<string, string> = {};
  const issues = z.array(z.object({ msg: z.string(), loc: z.array(z.union([z.string(), z.number()])).optional() })).safeParse(value.detail);
  const message = typeof value.detail === "string" ? value.detail : issues.success ? issues.data.map(issue => {
    const field = issue.loc?.at(-1);
    if (field !== undefined) fields[String(field)] = issue.msg;
    return issue.msg;
  }).join("; ") : status >= 500 ? "Error del servidor. Intente de nuevo." : `Error ${status}`;
  return new ApiError(status, message, fields, value.code, value.request_id);
}

function localValidation(error: z.ZodError, messages: Record<string, string>): ApiError {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "body");
    fields[field] = messages[field] ?? "Valor inválido";
  }
  return new ApiError(422, "Revise los campos indicados.", fields, "validation_error");
}

const RESET_MESSAGES = {
  email: "Introduce un correo electrónico válido.",
  token: "El enlace de recuperación no es válido. Solicita uno nuevo.",
  new_password: "La contraseña debe tener entre 12 y 128 caracteres.",
};

const CREDENTIAL_MESSAGES = {
  email: "Introduce un correo electrónico válido.",
  password: "La contraseña debe tener entre 12 y 128 caracteres.",
  accept_terms: "Debes aceptar los términos y la política de privacidad.",
};

/**
 * ERD-AUTH-03: único constructor del cuerpo de POST /auth/register para web y móvil.
 * Exige aceptación explícita (`true` literal) y nunca envía la versión de términos: la fija el servidor.
 * La contraseña se envía exacta (sin recortar).
 */
export function buildRegisterPayload(input: { email: string; password: string; acceptTerms: boolean | undefined }): RegisterIn {
  const parsed = RegisterInSchema.strict().safeParse({
    email: input.email.trim().toLowerCase(), password: input.password, accept_terms: input.acceptTerms,
  });
  if (!parsed.success) throw localValidation(parsed.error, CREDENTIAL_MESSAGES);
  return parsed.data;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error("Solicitud cancelada"));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

function withoutTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
  return value.slice(0, end);
}

export function createApiClient(baseUrl: string, fetchImpl: typeof fetch = fetch, timeoutMs = 10_000) {
  const root = `${withoutTrailingSlashes(baseUrl)}/api/v1`;
  async function request<S extends z.ZodTypeAny>(path: string, schema: S, init?: RequestInit, expectedStatus?: number): Promise<z.output<S>> {
    const ctrl = new AbortController();
    const cancel = () => ctrl.abort(init?.signal?.reason);
    if (init?.signal?.aborted) cancel();
    init?.signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      let response: Response;
      try {
        response = await abortable(fetchImpl(`${root}${path}`, {
          ...init, signal: ctrl.signal,
          headers: {
            ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
            Accept: "application/json", ...init?.headers,
          },
        }), ctrl.signal);
      } catch (error) {
        // Errores de dominio de un transporte envolvente (auth, cuenta cambiada) pasan tal cual.
        if (error instanceof ApiError) throw error;
        // Sin respuesta no hay contrato que violar. React Native/Expo rechaza con un Error genérico
        // (no TypeError) cuando la API no está accesible: siempre es un fallo de conexión.
        throw new ApiError(0, "No se pudo conectar con la API");
      }
      let body: unknown;
      if (response.status !== 204) {
        try { body = await abortable(response.json(), ctrl.signal); }
        catch (error) {
          if (ctrl.signal.aborted) throw error;
          if (response.ok) throw new ContractError();
        }
      }
      if (!response.ok) throw parseErrorBody(response.status, body);
      if (expectedStatus !== undefined && response.status !== expectedStatus) throw new ContractError();
      const parsed = schema.safeParse(body);
      if (!parsed.success) throw new ContractError();
      const home = path.match(/^\/homes\/([^/?]+)/)?.[1];
      if (home) {
        for (const item of Array.isArray(parsed.data) ? parsed.data : [parsed.data]) {
          if (item && typeof item === "object") {
            if (("home_id" in item && item.home_id !== home) || ("home" in item && item.home?.id !== home)) {
              throw new ContractError();
            }
          }
        }
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (ctrl.signal.aborted || error instanceof TypeError) throw new ApiError(0, "No se pudo conectar con la API");
      throw new ContractError();
    } finally {
      clearTimeout(timer);
      init?.signal?.removeEventListener("abort", cancel);
    }
  }
  async function list<S extends z.ZodTypeAny>(path: string, schema: S, signal?: AbortSignal): Promise<z.output<S>[]> {
    const result: z.output<S>[] = [];
    const ids = new Set<string>();
    for (let offset = 0; ; offset += 100) {
      const page = await request(`${path}${path.includes("?") ? "&" : "?"}limit=100&offset=${offset}`, schema.array(), { signal });
      for (const item of page) {
        const id = (item as { id: string }).id;
        if (ids.has(id)) throw new ContractError();
        ids.add(id);
      }
      result.push(...page);
      if (page.length < 100) return result;
    }
  }
  const homePath = (homeId: string) => `/homes/${z.string().uuid().parse(homeId)}`;
  const idPath = (id: string) => z.string().uuid().parse(id);
  const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha AAAA-MM-DD");
  const query = (params: Record<string, string | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, value);
    const text = search.toString();
    return text ? `?${text}` : "";
  };
  const write = (method: string, input?: unknown): RequestInit => ({ method, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  // Bill detail responses must belong to the exact bill requested (home_id is checked generically).
  const ownBill = <T extends { bill_id: string }>(bill: string) => (value: T): T => {
    if (value.bill_id !== bill) throw new ContractError();
    return value;
  };
  return {
    listHomes: (signal?: AbortSignal) => list("/homes", HomeSchema, signal),
    listBills: (id: string, signal?: AbortSignal) => list(`${homePath(id)}/bills`, BillSchema, signal),
    getBill: (id: string, bill: string, signal?: AbortSignal) => request(`${homePath(id)}/bills/${idPath(bill)}`, BillSchema, { signal }),
    createBill: (id: string, input: BillInput) => request(`${homePath(id)}/bills`, BillSchema, write("POST", { ...input, source: "manual" })),
    // ERD-OCR-PROD: lectura asíncrona. startOcrJob responde 202 con el estado `pending`; se consulta con getOcrJob.
    // Acepta fotos y PDF; el servidor decide el tipo por los bytes. Nunca crea una factura: deja un borrador.
    startOcrJob: (id: string, file: BillImage | File, source: "web" | "mobile") => {
      const body = new FormData();
      if (typeof File !== "undefined" && file instanceof File) body.append("file", file);
      else body.append("file", file as unknown as Blob);
      body.append("source", source);
      return request(`${homePath(id)}/bills/ocr-jobs`, OcrJobSchema, { method: "POST", body }, 202);
    },
    getOcrJob: (id: string, document: string, signal?: AbortSignal) =>
      request(`${homePath(id)}/bills/ocr-jobs/${idPath(document)}`, OcrJobSchema, { signal }).then(job => {
        if (job.document_id !== document) throw new ContractError();
        return job;
      }),
    retryOcrJob: (id: string, document: string) =>
      request(`${homePath(id)}/bills/ocr-jobs/${idPath(document)}/retry`, OcrJobSchema, write("POST", {}), 202).then(job => {
        if (job.document_id !== document) throw new ContractError();
        return job;
      }),
    // ERD-ALERT-02: marcar la factura como pagada (retira la alerta de pago) o pendiente.
    setBillPayment: (id: string, bill: string, paid: boolean) =>
      request(`${homePath(id)}/bills/${idPath(bill)}/payment`, BillSchema, write("PUT", { paid })).then(updated => {
        if (updated.id !== bill) throw new ContractError();
        return updated;
      }),
    updateBill: (id: string, bill: string, input: BillInput) => request(`${homePath(id)}/bills/${idPath(bill)}`, BillSchema, write("PUT", input)),
    deleteBill: (id: string, bill: string) => request(`${homePath(id)}/bills/${idPath(bill)}`, z.undefined(), write("DELETE")),
    // ERD-BILL-02: detalle manual (cargos/descuentos) y evaluación de solo lectura (nunca aprueba).
    getBillItems: async (id: string, bill: string, signal?: AbortSignal) =>
      request(`${homePath(id)}/bills/${idPath(bill)}/items`, BillItemsOutSchema, { signal }).then(ownBill(bill)),
    putBillItems: async (id: string, bill: string, input: BillItemsReplace) =>
      request(`${homePath(id)}/bills/${idPath(bill)}/items`, BillItemsOutSchema, write("PUT", input)).then(ownBill(bill)),
    assessBill: async (id: string, bill: string, signal?: AbortSignal) =>
      request(`${homePath(id)}/bills/${idPath(bill)}/validate`, BillAssessmentSchema, { ...write("POST", {}), signal }).then(ownBill(bill)),
    getDashboard: async (id: string, signal?: AbortSignal, billId?: string) => {
      const data = await request(`${homePath(id)}/dashboard${query({ bill_id: billId === undefined ? undefined : idPath(billId) })}`, DashboardSchema, { signal });
      if (billId !== undefined && data.latest_bill?.bill_id !== billId) throw new ContractError();
      return data;
    },
    // ERD-ANOM-01-COMPLETE: anomalías persistidas (por defecto las vigentes). Los filtros son opcionales.
    listAnomalies: (id: string, opts: { status?: AnomalyListStatus; granularity?: Anomaly["granularity"]; kind?: Anomaly["kind"]; limit?: number } = {},
      signal?: AbortSignal): Promise<Anomaly[]> => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(opts)) if (value !== undefined) query.set(key, String(value));
      const qs = query.toString();
      return request(`${homePath(id)}/anomalies${qs ? `?${qs}` : ""}`, AnomaliesSchema, { signal });
    },
    updateAnomaly: (id: string, anomaly: string, status: "open" | "acknowledged" | "dismissed") =>
      request(`${homePath(id)}/anomalies/${idPath(anomaly)}`, AnomalySchema, write("PATCH", { status })).then(updated => {
        if (updated.id !== anomaly) throw new ContractError();
        return updated;
      }),
    // ERD-INT-01: interrupciones del servicio eléctrico (registro manual, historial y resumen mensual).
    listOutages: (id: string, signal?: AbortSignal) => list(`${homePath(id)}/outages`, OutageSchema, signal),
    getOutageSummary: (id: string, months = 12, signal?: AbortSignal) => request(`${homePath(id)}/outages/summary?months=${months}`, OutageSummarySchema, { signal }),
    createOutage: (id: string, input: OutageInput) => request(`${homePath(id)}/outages`, OutageSchema, write("POST", input)),
    updateOutage: (id: string, outage: string, input: OutageInput) => request(`${homePath(id)}/outages/${idPath(outage)}`, OutageSchema, write("PUT", input)),
    deleteOutage: (id: string, outage: string) => request(`${homePath(id)}/outages/${idPath(outage)}`, z.undefined(), write("DELETE")),
    // ERD-SCORE-01: Energy Score de la vivienda (solo lectura; la fórmula vive en el backend).
    getEnergyScore: (id: string, signal?: AbortSignal) => request(`${homePath(id)}/energy-score`, EnergyScoreSchema, { signal }),
    // ERD-SAVE-01: recomendaciones de ahorro. `refreshRecommendations` recalcula (idempotente) y devuelve las vigentes.
    listRecommendations: (id: string, opts: { status?: RecommendationListStatus; limit?: number } = {}, signal?: AbortSignal) => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(opts)) if (value !== undefined) query.set(key, String(value));
      const qs = query.toString();
      return request(`${homePath(id)}/recommendations${qs ? `?${qs}` : ""}`, RecommendationListSchema, { signal });
    },
    refreshRecommendations: (id: string) => request(`${homePath(id)}/recommendations/refresh`, RecommendationListSchema, write("POST", {})),
    // ERD-SAVE-01-CLOSE: meta sugerida (solo lectura) y «Aplicar objetivo» (el servidor recalcula; no recibe cifras del cliente).
    getGoalProposal: (id: string, signal?: AbortSignal) => request(`${homePath(id)}/recommendations/goal-proposal`, GoalProposalOutSchema, { signal }),
    applyGoalProposal: (id: string) => request(`${homePath(id)}/recommendations/goal-proposal/apply`, GoalSchema, write("POST", {})),
    updateRecommendation: (id: string, recommendation: string, status: "active" | "applied" | "dismissed") =>
      request(`${homePath(id)}/recommendations/${idPath(recommendation)}`, RecommendationSchema, write("PATCH", { status })).then(updated => {
        if (updated.id !== recommendation) throw new ContractError();
        return updated;
      }),
    // ERD-AI-CHAT: Energy Copilot (conversaciones privadas de la persona en esta vivienda). El envío de mensajes es streaming y vive en
    // cada app (la web lo lee con ReadableStream); aquí solo las operaciones JSON, iguales en web y móvil.
    getCopilotUsage: (id: string, signal?: AbortSignal) => request(`${homePath(id)}/copilot/usage`, CopilotUsageOutSchema, { signal }),
    listCopilotConversations: (id: string, signal?: AbortSignal) =>
      request(`${homePath(id)}/copilot/conversations?limit=100`, ConversationOutSchema.array(), { signal }),
    createCopilotConversation: (id: string, title?: string) =>
      request(`${homePath(id)}/copilot/conversations`, ConversationOutSchema, write("POST", title ? { title } : {}), 201),
    renameCopilotConversation: (id: string, conversation: string, title: string) =>
      request(`${homePath(id)}/copilot/conversations/${idPath(conversation)}`, ConversationOutSchema, write("PATCH", { title })).then(updated => {
        if (updated.id !== conversation) throw new ContractError();
        return updated;
      }),
    deleteCopilotConversation: (id: string, conversation: string) =>
      request(`${homePath(id)}/copilot/conversations/${idPath(conversation)}`, z.undefined(), write("DELETE")),
    listCopilotMessages: (id: string, conversation: string, signal?: AbortSignal) =>
      request(`${homePath(id)}/copilot/conversations/${idPath(conversation)}/messages`, CopilotMessageOutSchema.array(), { signal }).then(rows => {
        if (rows.some(row => row.conversation_id !== conversation)) throw new ContractError();
        return rows;
      }),
    setCopilotFeedback: (id: string, conversation: string, message: string, value: 1 | -1 | null) =>
      request(`${homePath(id)}/copilot/conversations/${idPath(conversation)}/messages/${idPath(message)}/feedback`, CopilotMessageOutSchema,
        write("PUT", { value })).then(updated => {
        if (updated.id !== message || updated.conversation_id !== conversation) throw new ContractError();
        return updated;
      }),
    listEquipment: (id: string, signal?: AbortSignal) => list(`${homePath(id)}/equipment`, EquipmentSchema, signal),
    getEquipment: (id: string, item: string, signal?: AbortSignal) => request(`${homePath(id)}/equipment/${idPath(item)}`, EquipmentSchema, { signal }),
    createEquipment: (id: string, input: EquipmentInput) => request(`${homePath(id)}/equipment`, EquipmentSchema, write("POST", input)),
    updateEquipment: (id: string, item: string, input: EquipmentInput) => request(`${homePath(id)}/equipment/${idPath(item)}`, EquipmentSchema, write("PUT", input)),
    deleteEquipment: (id: string, item: string) => request(`${homePath(id)}/equipment/${idPath(item)}`, z.undefined(), write("DELETE")),
    getEstimate: (id: string, signal?: AbortSignal) => request(`${homePath(id)}/equipment/estimate`, EquipmentEstimateSchema, { signal }),
    listAlerts: (id: string, opts?: { includeDismissed?: boolean }, signal?: AbortSignal) => list(`${homePath(id)}/alerts${opts?.includeDismissed ? "?include_dismissed=true" : ""}`, AlertItemSchema, signal),
    setAlertStatus: (id: string, item: string, status: AlertStatus) => request(`${homePath(id)}/alerts/${idPath(item)}`, AlertItemSchema, write("PATCH", { status })),
    // Fase 2: lecturas del medidor, consumo agregado, metas mensuales y tarifas publicadas.
    listReadings: (id: string, signal?: AbortSignal) => list(`${homePath(id)}/readings`, ReadingSchema, signal),
    createReading: (id: string, input: ReadingInput) => request(`${homePath(id)}/readings`, ReadingSchema, write("POST", input)),
    deleteReading: (id: string, reading: string) => request(`${homePath(id)}/readings/${idPath(reading)}`, z.undefined(), write("DELETE")),
    getConsumption: async (id: string, opts: { granularity: Granularity; from: string; to: string }, signal?: AbortSignal) =>
      request(`${homePath(id)}/consumption${query({ granularity: opts.granularity, from: isoDate.parse(opts.from), to: isoDate.parse(opts.to) })}`,
        ConsumptionSchema, { signal }),
    getGoal: (id: string, signal?: AbortSignal) => request(`${homePath(id)}/goal`, GoalOrNullSchema, { signal }),
    putGoal: (id: string, input: GoalInput) => request(`${homePath(id)}/goal`, GoalSchema, write("PUT", input)),
    getGoalProgress: async (id: string, opts?: { on?: string }, signal?: AbortSignal) =>
      request(`${homePath(id)}/goal/progress${query({ on: opts?.on === undefined ? undefined : isoDate.parse(opts.on) })}`,
        GoalProgressSchema, { signal }),
    // ERD-AUTH-03: versiones legales públicas y borrado de cuenta con reautenticación (204 sin cuerpo).
    getLegal: (signal?: AbortSignal) => request("/legal", LegalOutSchema, { signal }),
    deleteAccount: async (password: string) => {
      const parsed = AccountDeletionInSchema.strict().safeParse({ password });
      if (!parsed.success) throw localValidation(parsed.error, CREDENTIAL_MESSAGES);
      return request("/auth/me", z.undefined(), write("DELETE", parsed.data));
    },
    // ERD-AUTH-05: recuperación. forgot siempre 202 (exista o no la cuenta); reset 204 sin cuerpo.
    // El token viaja solo en el cuerpo JSON, nunca en la URL de la API.
    forgotPassword: async (emailAddress: string) => {
      // El contrato generado no impone formato de email (solo longitud): validación básica local.
      const parsed = PasswordForgotInSchema.strict()
        .refine(body => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email), { path: ["email"] })
        .safeParse({ email: emailAddress.trim().toLowerCase() });
      if (!parsed.success) throw localValidation(parsed.error, RESET_MESSAGES);
      await request("/auth/password/forgot", PasswordForgotAcceptedSchema, write("POST", parsed.data), 202);
    },
    resetPassword: async (token: string, newPassword: string) => {
      const parsed = PasswordResetInSchema.strict().safeParse({ token, new_password: newPassword });
      if (!parsed.success) throw localValidation(parsed.error, RESET_MESSAGES);
      return request("/auth/password/reset", z.undefined(), write("POST", parsed.data), 204);
    },
    // Auditoría C-10: verificación de correo. El canje (público, token solo en el cuerpo) devuelve 204; el (re)envío exige sesión y devuelve 202.
    verifyEmail: async (token: string) => {
      const parsed = EmailVerifyInSchema.strict().safeParse({ token });
      if (!parsed.success) throw localValidation(parsed.error, RESET_MESSAGES);
      return request("/auth/email/verify", z.undefined(), write("POST", parsed.data), 204);
    },
    requestEmailVerification: () => request("/auth/email/verification", EmailVerificationRequestOutSchema, write("POST", {}), 202),
    listTariffs: async (opts?: { distributor?: Distributor; on?: string }, signal?: AbortSignal) =>
      list(`/tariffs${query({ distributor: opts?.distributor, on: opts?.on === undefined ? undefined : isoDate.parse(opts.on) })}`,
        TariffSchema, signal),
  };
}
