import { ApiError, buildRegisterPayload } from '@energyrd/api-client';

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
}
// ERD-AUTH-03: terms_version/terms_accepted_at son nulos hasta que el usuario acepta al registrarse.
export interface Account {
  id: string; email: string; role: string; created_at: string;
  terms_version: string | null; terms_accepted_at: string | null;
}
export type CredentialErrors = Partial<Record<'email' | 'password', string>>;
export type RegisterErrors = CredentialErrors & { acceptTerms?: string };
export function validateCredentials(email: string, password: string): CredentialErrors {
  const errors: CredentialErrors = {};
  const normalized = email.trim();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
    errors.email = 'Ingrese un correo válido (máximo 254 caracteres).';
  // Python/backend measures Unicode characters, not UTF-16 code units.
  const length = Array.from(password).length;
  if (length < 12 || length > 128) errors.password = 'Use entre 12 y 128 caracteres.';
  return errors;
}
export function parsePair(value: unknown): TokenPair {
  const p = value as Partial<TokenPair> | null;
  if (!p || typeof p.access_token !== 'string' || !p.access_token || p.access_token.length > 4096 ||
    typeof p.refresh_token !== 'string' || !p.refresh_token || p.refresh_token.length > 4096 ||
    p.token_type !== 'bearer' || typeof p.expires_in !== 'number' || !Number.isInteger(p.expires_in) || p.expires_in <= 0)
    throw new ApiError(502, 'Respuesta de sesión inválida. Inicie sesión de nuevo.');
  return { access_token: p.access_token, refresh_token: p.refresh_token, token_type: 'bearer', expires_in: p.expires_in };
}
function parseAccount(value: unknown): Account {
  const u = value as Partial<Account> | null;
  const termsVersionOk = u != null && (u.terms_version === null || typeof u.terms_version === 'string');
  const termsAcceptedOk = u != null && (u.terms_accepted_at === null ||
    (typeof u.terms_accepted_at === 'string' && Number.isFinite(Date.parse(u.terms_accepted_at))));
  if (!u || typeof u.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u.id) ||
    typeof u.email !== 'string' || typeof u.role !== 'string' || typeof u.created_at !== 'string' || !Number.isFinite(Date.parse(u.created_at)) ||
    !termsVersionOk || !termsAcceptedOk)
    throw new ApiError(502, 'Respuesta de cuenta inválida. Inicie sesión de nuevo.');
  return {
    id: u.id, email: u.email, role: u.role, created_at: u.created_at,
    terms_version: u.terms_version ?? null, terms_accepted_at: u.terms_accepted_at ?? null,
  };
}
export function createAuthClient(baseUrl: string, fetchImpl: typeof fetch = fetch, timeoutMs = 10_000) {
  const root = `${baseUrl.replace(/\/+$/, '')}/api/v1/auth`;
  async function request(path: string, body?: Record<string, unknown>, access?: string): Promise<unknown> {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    // The deadline covers headers AND the body, even for an uncooperative fetch mock.
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { ctrl.abort(); reject(new ApiError(0, 'No se pudo conectar. Compruebe la conexión e intente iniciar sesión de nuevo.')); }, timeoutMs);
    });
    try {
      return await Promise.race([deadline, (async () => {
        const response = await fetchImpl(`${root}${path}`, {
          method: body ? 'POST' : 'GET', signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(access ? { Authorization: `Bearer ${access}` } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        if (!response.ok) {
          // Never surface arbitrary auth error bodies: servers/proxies can echo secrets.
          const message = response.status === 401 ? 'Correo o contraseña incorrectos. Intente de nuevo.'
            : response.status === 409 ? 'No se pudo crear la cuenta con ese correo. Intente iniciar sesión.'
            : response.status === 422 ? 'Revise el correo, la contraseña (12 a 128 caracteres) y la aceptación de los términos.'
            : 'No se pudo completar la solicitud. Intente de nuevo.';
          throw new ApiError(response.status, message);
        }
        return response.status === 204 ? undefined : await response.json();
      })()]);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof TypeError) throw new ApiError(0, 'No se pudo conectar. Compruebe la conexión e intente iniciar sesión de nuevo.');
      throw new ApiError(502, 'Respuesta de sesión inválida. Inicie sesión de nuevo.');
    } finally { clearTimeout(timer!); }
  }
  const credentials = async (path: string, email: string, password: string) => {
    const fields = validateCredentials(email, password);
    if (Object.keys(fields).length) throw new ApiError(422, 'Revise los campos indicados.', fields);
    return parsePair(await request(path, { email: email.trim().toLowerCase(), password }));
  };
  return {
    login: (email: string, password: string) => credentials('/login', email, password),
    // ERD-AUTH-03: el registro exige accept_terms:true explícito; el cliente nunca envía la versión.
    register: async (email: string, password: string, acceptTerms: boolean) => {
      const fields: RegisterErrors = validateCredentials(email, password);
      if (!acceptTerms) fields.acceptTerms = 'Debe aceptar los Términos de Servicio y la Política de Privacidad.';
      if (Object.keys(fields).length) throw new ApiError(422, 'Revise los campos indicados.', fields);
      const payload = buildRegisterPayload({ email, password, acceptTerms });
      return parsePair(await request('/register', payload));
    },
    refresh: async (refresh_token: string) => parsePair(await request('/refresh', { refresh_token })),
    logout: async (refresh_token: string) => { await request('/logout', { refresh_token }); },
    me: async (access: string) => parseAccount(await request('/me', undefined, access)),
  };
}
export type AuthClient = ReturnType<typeof createAuthClient>;
