import { ApiError, ContractError, parseErrorBody } from "@energyrd/api-client";
import { UserOutSchema, type UserOut } from "@energyrd/api-contracts";
export const authEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === "true";
export const AccountSchema = UserOutSchema;
export type Account = UserOut;
let generation = 0;
let accountController = new AbortController();
/** Non-retryable (4xx): a response that belongs to a previous account is discarded, never shown. */
export class AccountChangedError extends ApiError {
  constructor() { super(409, "La cuenta cambió durante la solicitud. Se descartó la respuesta.", {}, "account_changed"); this.name = "AccountChangedError"; }
}
export const accountGeneration = () => generation;
export function assertAccountGeneration(expected: number) {
  if (expected !== generation) throw new AccountChangedError();
}
export function invalidateAccountRequests() {
  generation += 1;
  accountController.abort();
  accountController = new AbortController();
}
export const bffFetch: typeof fetch = async (input, init) => {
  if (typeof input !== "string" || !input.startsWith("/api/v1/") || input.includes("..") || input.includes("\\")) throw new Error("Only domain API paths are allowed");
  const current = generation;
  const headers = new Headers(init?.headers);
  headers.delete("authorization"); headers.delete("cookie");
  const response = await fetch(`/api/bff${input.slice("/api/v1".length)}`, { ...init, headers, credentials: "same-origin", cache: "no-store", redirect: "error", signal: init?.signal ? AbortSignal.any([init.signal, accountController.signal]) : accountController.signal });
  assertAccountGeneration(current);
  if (response.status === 401) window.dispatchEvent(new Event("energyrd.session-expired"));
  // Read the body here and re-check the account after it arrives; the returned copy re-checks
  // before and after every later read, so a previous account's data can never be consumed.
  let text: string;
  try { text = await response.text(); }
  catch (cause) { assertAccountGeneration(current); throw cause; }
  assertAccountGeneration(current);
  const guarded = new Response([101, 204, 205, 304].includes(response.status) ? null : text, { status: response.status, statusText: response.statusText, headers: response.headers });
  guarded.text = async () => { assertAccountGeneration(current); return text; };
  guarded.json = async () => {
    assertAccountGeneration(current);
    const value: unknown = JSON.parse(text);
    assertAccountGeneration(current);
    return value;
  };
  return guarded;
};
export async function accountRequest(path: "login" | "register" | "logout" | "me", input?: { email: string; password: string }): Promise<unknown> {
  // 428 auth_epoch_required is answered by the BFF itself (no upstream contact) together with a
  // fresh epoch cookie, so exactly one local retry is safe; it is never repeated.
  for (let attempt = 0; ; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`/api/bff/auth/${path}`, { method: path === "me" ? "GET" : "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store", redirect: "error", body: path === "me" ? undefined : JSON.stringify(input ?? {}), signal: AbortSignal.timeout(10_000) });
    } catch { throw new ApiError(0, "No se pudo confirmar la operación. No se reintentó. Inicia sesión de nuevo."); }
    // A non-JSON body (proxy HTML, stack trace) must never become a UI message.
    let body: unknown;
    try { body = await response.json(); } catch { body = undefined; }
    if (!response.ok) {
      const error = parseErrorBody(response.status, body);
      if (attempt === 0 && response.status === 428 && error.code === "auth_epoch_required" && (path === "login" || path === "register")) continue;
      throw error;
    }
    if (path !== "me") return undefined;
    const account = AccountSchema.safeParse(body);
    if (!account.success) throw new ContractError();
    return account.data;
  }
}
