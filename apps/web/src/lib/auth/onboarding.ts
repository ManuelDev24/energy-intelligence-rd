import { ApiError, ContractError, parseErrorBody } from "@energyrd/api-client";
import { ContractOutSchema, GoalSchema, HomeSchema, type Distributor } from "@energyrd/api-contracts";
import { AccountChangedError, accountGeneration, assertAccountGeneration, bffFetch } from "./client";

export type HomeDraft = {
  name?: string; distributor?: Distributor; address?: string | null; city?: string | null; province?: string | null; municipality?: string | null;
  sector?: string | null; user_type?: string | null; occupants?: number | null;
  has_ac?: boolean | null; has_water_heater?: boolean | null; has_pool?: boolean | null;
  has_solar?: boolean | null; has_inverter?: boolean | null;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function pathFor(homeId: string, suffix = "") {
  if (!UUID.test(homeId)) throw new Error("Vivienda inválida.");
  return `/api/v1/homes/${homeId}${suffix}`;
}
async function request<T>(path: string, method: string, input: unknown, schema: { safeParse: (value: unknown) => { success: boolean; data?: T } }, homeId?: string): Promise<T> {
  const current = accountGeneration();
  let response: Response;
  try { response = await bffFetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }); }
  catch (cause) {
    if (cause instanceof AccountChangedError) throw cause;
    throw new ApiError(0, "No se pudo confirmar la operación. Consulta los datos antes de reintentar.");
  }
  let body: unknown;
  try { body = await response.json(); }
  catch (cause) { if (cause instanceof AccountChangedError) throw cause; body = undefined; }
  assertAccountGeneration(current);
  if (!response.ok) throw parseErrorBody(response.status, body);
  const parsed = schema.safeParse(body);
  if (!parsed.success || (homeId && (parsed.data as { home_id?: string; id?: string }).home_id !== homeId && (parsed.data as { id?: string }).id !== homeId)) throw new ContractError();
  assertAccountGeneration(current);
  return parsed.data as T;
}
export function readProfileHome(id: string) {
  return request(pathFor(id), "GET", undefined, HomeSchema, id);
}
export function saveOnboardingHome(id: string | null, draft: HomeDraft) {
  return request(id ? pathFor(id) : "/api/v1/homes", id ? "PATCH" : "POST", draft, HomeSchema, id ?? undefined);
}
export function readProfileContract(id: string) {
  return request(pathFor(id, "/contract"), "GET", undefined, ContractOutSchema, id);
}
export function saveOnboardingContract(id: string, accountNumber: string) {
  return request(pathFor(id, "/contract"), "PUT", { account_number: accountNumber }, ContractOutSchema, id);
}
export function saveOnboardingGoal(id: string, goal: { monthly_kwh: string | null; monthly_amount_rd: string | null }) {
  return request(pathFor(id, "/goal"), "PUT", goal, GoalSchema, id);
}
