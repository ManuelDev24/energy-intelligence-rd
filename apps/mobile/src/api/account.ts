import { ContractError } from '@energyrd/api-client';
import {
  HomeSchema, InvitationOutSchema, MemberOutSchema, NotificationPreferencesOutSchema, SessionOutSchema, TokensOutSchema,
} from '@energyrd/api-contracts';
import { z } from 'zod';
import { localApiError, serverError } from './errors';

// ERD-PROF-01 / ERD-SHARE-01: cuenta (contraseña, avisos, sesiones) y compartir vivienda. Los errores se reconstruyen
// con texto local (api/errors.ts); nunca se muestra el detalle del servidor.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OFFLINE = 'No se pudo confirmar la operación. Revise los datos antes de volver a intentar.';
const none = z.undefined();
const length = (value: string) => Array.from(value).length;
const passwordOk = (value: string) => length(value) >= 12 && length(value) <= 128;
const uuid = (value: string, what: string) => {
  if (!UUID.test(value)) throw localApiError(422, `${what} no es válido.`);
  return encodeURIComponent(value);
};

/** Token del enlace de invitación (`…#token=<43>`) o el token pegado tal cual. null si no se reconoce uno. */
export function parseInvitationLink(input: string): string | null {
  const text = input.trim();
  if (TOKEN.test(text)) return text;
  const hash = text.includes('#') ? text.slice(text.indexOf('#') + 1) : '';
  const values = new URLSearchParams(hash).getAll('token');
  return values.length === 1 && TOKEN.test(values[0]) ? values[0] : null;
}

export function createAccountApi(baseUrl: string, transport: typeof fetch) {
  const root = baseUrl.replace(/\/+$/, '');
  const request = async <T extends z.ZodTypeAny>(path: string, method: string, input: unknown, schema: T): Promise<z.output<T>> => {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { ctrl.abort(); reject(localApiError(0, OFFLINE)); }, 10_000);
    });
    try {
      return await Promise.race([timeout, (async () => {
        const response = await transport(`${root}${path}`, {
          method, signal: ctrl.signal, headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          ...(method === 'GET' ? {} : { body: JSON.stringify(input ?? {}) }),
        });
        let body: unknown;
        if (response.status !== 204) {
          try { body = await response.json(); } catch { if (!response.ok) throw serverError(response.status, null); throw new ContractError(); }
        }
        if (!response.ok) throw serverError(response.status, body);
        const parsed = schema.safeParse(body);
        if (!parsed.success) throw new ContractError();
        return parsed.data;
      })()]);
    } catch (error) {
      if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')) throw localApiError(0, OFFLINE);
      throw error;
    } finally { clearTimeout(timer); }
  };
  const home = (homeId: string) => `/api/v1/homes/${uuid(homeId, 'La vivienda')}`;

  return {
    /** Devuelve el par de tokens nuevo: el llamador debe adoptarlo (`authSession.replaceTokens`). */
    changePassword: async (currentPassword: string, newPassword: string) => {
      if (!passwordOk(currentPassword)) throw localApiError(422, 'Ingrese su contraseña actual (12 a 128 caracteres).', { current_password: 'x' });
      if (!passwordOk(newPassword) || newPassword === currentPassword) throw localApiError(422, 'La nueva contraseña debe tener entre 12 y 128 caracteres y ser distinta de la actual.', { new_password: 'x' });
      return request('/api/v1/auth/password/change', 'POST', { current_password: currentPassword, new_password: newPassword }, TokensOutSchema);
    },
    getPreferences: async () => request('/api/v1/auth/me/preferences', 'GET', undefined, NotificationPreferencesOutSchema),
    savePreferences: async (alertsEmail: boolean, alertsPush: boolean) =>
      request('/api/v1/auth/me/preferences', 'PUT', { alerts_email: alertsEmail, alerts_push: alertsPush }, NotificationPreferencesOutSchema),
    listSessions: async () => request('/api/v1/auth/sessions', 'GET', undefined, SessionOutSchema.array()),
    revokeSession: async (sessionId: string) => request(`/api/v1/auth/sessions/${uuid(sessionId, 'La sesión')}`, 'DELETE', undefined, none),
    revokeOtherSessions: async () => request('/api/v1/auth/sessions/revoke-others', 'POST', undefined, none),

    listMembers: async (homeId: string) => request(`${home(homeId)}/members`, 'GET', undefined, MemberOutSchema.array()),
    listInvitations: async (homeId: string) => request(`${home(homeId)}/invitations`, 'GET', undefined, InvitationOutSchema.array()),
    createInvitation: async (homeId: string, email: string) => {
      const address = email.trim().toLowerCase();
      if (!EMAIL.test(address) || length(address) > 254) throw localApiError(422, 'Ingrese un correo válido.', { email: 'x' });
      return request(`${home(homeId)}/invitations`, 'POST', { email: address }, InvitationOutSchema);
    },
    revokeInvitation: async (homeId: string, invitationId: string) =>
      request(`${home(homeId)}/invitations/${uuid(invitationId, 'La invitación')}`, 'DELETE', undefined, none),
    removeMember: async (homeId: string, userId: string) => request(`${home(homeId)}/members/${uuid(userId, 'La persona')}`, 'DELETE', undefined, none),
    leaveHome: async (homeId: string) => request(`${home(homeId)}/members/me`, 'DELETE', undefined, none),
    transferOwnership: async (homeId: string, userId: string, password: string) => {
      if (!passwordOk(password)) throw localApiError(422, 'Ingrese su contraseña (12 a 128 caracteres).', { password: 'x' });
      return request(`${home(homeId)}/transfer-ownership`, 'POST', { user_id: userId, password }, none);
    },
    acceptInvitation: async (token: string) => {
      if (!TOKEN.test(token)) throw localApiError(422, 'El enlace de invitación no es válido.', { token: 'x' });
      return request('/api/v1/invitations/accept', 'POST', { token }, HomeSchema);
    },
  };
}
