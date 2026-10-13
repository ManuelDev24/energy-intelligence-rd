import { ApiError } from '@energyrd/api-client';
import type { AuthSession } from './session';

/** Only the typed domain client uses this transport; auth never recursively refreshes. */
export function createAuthenticatedFetch(session: AuthSession, fetchImpl: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const epoch = session.getSnapshot().epoch;
    const check = () => session.checkEpoch(epoch);
    const send = (token: string) => {
      check();
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${token}`);
      return fetchImpl(input, { ...init, headers });
    };
    const access = await session.getAccessToken();
    let response = await send(access);
    check();
    if (response.status === 401) {
      const replacement = await session.refreshAccess(access);
      check();
      // 401 means the backend rejected authorization BEFORE performing a domain mutation.
      response = await send(replacement);
      check();
      if (response.status === 401) {
        await session.invalidate();
        throw new ApiError(401, 'La sesión terminó. Inicie sesión de nuevo.');
      }
    }
    // Shared client reads JSON after headers. Guard that boundary too, not just fetch().
    const originalJson = response.json.bind(response);
    response.json = async () => { check(); const body = await originalJson(); check(); return body; };
    return response;
  };
}
