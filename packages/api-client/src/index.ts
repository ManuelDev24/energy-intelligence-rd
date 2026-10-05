import { z } from "zod";
import {
  HomeSchema, BillSchema, DashboardSchema, EquipmentSchema, EquipmentEstimateSchema, AlertItemSchema,
  ReadingSchema, ConsumptionSchema, GoalSchema, GoalOrNullSchema, GoalProgressSchema, TariffSchema,
  BillItemsOutSchema, BillAssessmentSchema, AccountDeletionInSchema, LegalOutSchema, RegisterInSchema,
  PasswordForgotInSchema, PasswordForgotAcceptedSchema, PasswordResetInSchema,
  type BillInput, type EquipmentInput, type AlertStatus, type ReadingInput, type GoalInput, type Granularity,
  type Distributor, type BillItemsReplace, type RegisterIn,
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

export function createApiClient(baseUrl: string, fetchImpl: typeof fetch = fetch, timeoutMs = 10_000) {
  const root = `${baseUrl.replace(/\/+$/, "")}/api/v1`;
  async function request<S extends z.ZodTypeAny>(path: string, schema: S, init?: RequestInit, expectedStatus?: number): Promise<z.output<S>> {
    const ctrl = new AbortController();
    const cancel = () => ctrl.abort(init?.signal?.reason);
    if (init?.signal?.aborted) cancel();
    init?.signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const response = await abortable(fetchImpl(`${root}${path}`, {
        ...init, signal: ctrl.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json", ...init?.headers },
      }), ctrl.signal);
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
    updateBill: (id: string, bill: string, input: BillInput) => request(`${homePath(id)}/bills/${idPath(bill)}`, BillSchema, write("PUT", input)),
    deleteBill: (id: string, bill: string) => request(`${homePath(id)}/bills/${idPath(bill)}`, z.undefined(), write("DELETE")),
    // ERD-BILL-02: detalle manual (cargos/descuentos) y evaluación de solo lectura (nunca aprueba).
    getBillItems: async (id: string, bill: string, signal?: AbortSignal) =>
      request(`${homePath(id)}/bills/${idPath(bill)}/items`, BillItemsOutSchema, { signal }).then(ownBill(bill)),
    putBillItems: async (id: string, bill: string, input: BillItemsReplace) =>
      request(`${homePath(id)}/bills/${idPath(bill)}/items`, BillItemsOutSchema, write("PUT", input)).then(ownBill(bill)),
    assessBill: async (id: string, bill: string, signal?: AbortSignal) =>
      request(`${homePath(id)}/bills/${idPath(bill)}/validate`, BillAssessmentSchema, { ...write("POST", {}), signal }).then(ownBill(bill)),
    getDashboard: (id: string, signal?: AbortSignal) => request(`${homePath(id)}/dashboard`, DashboardSchema, { signal }),
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
    listTariffs: async (opts?: { distributor?: Distributor; on?: string }, signal?: AbortSignal) =>
      list(`/tariffs${query({ distributor: opts?.distributor, on: opts?.on === undefined ? undefined : isoDate.parse(opts.on) })}`,
        TariffSchema, signal),
  };
}
