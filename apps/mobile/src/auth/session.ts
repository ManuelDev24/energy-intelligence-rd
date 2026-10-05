import { ApiError } from '@energyrd/api-client';
import { parsePair, type Account, type AuthClient, type TokenPair } from './client';

export interface SecureTokenStore {
  read: () => Promise<string | null>;
  write: (raw: string) => Promise<void>;
  clear: () => Promise<void>;
}
export interface AuthSnapshot {
  status: 'hydrating' | 'busy' | 'signedOut' | 'authenticated';
  user: Account | null;
  epoch: number;
  message: string | null;
}
export function createAuthSession({ client, store, origin, onBoundary, now = Date.now }: {
  client: AuthClient; store: SecureTokenStore; origin: string; onBoundary: () => void; now?: () => number;
}) {
  let snapshot: AuthSnapshot = { status: 'hydrating', user: null, epoch: 0, message: null };
  let tokens: TokenPair | null = null;
  let expiresAt = 0;
  let hydration: Promise<void> | null = null;
  let refreshFlight: Promise<string> | null = null;
  let rotatingToken: string | null = null;
  const listeners = new Set<() => void>();
  let storageQueue: Promise<unknown> = Promise.resolve();
  const storage = <T,>(action: () => Promise<T>) => {
    const result = storageQueue.then(action);
    storageQueue = result.catch(() => undefined);
    return result;
  };
  const publish = (patch: Partial<AuthSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };
  const boundary = (status: AuthSnapshot['status'], message: string | null = null) => {
    tokens = null;
    expiresAt = 0;
    refreshFlight = null;
    rotatingToken = null;
    onBoundary();
    publish({ status, message, user: null, epoch: snapshot.epoch + 1 });
    return snapshot.epoch;
  };
  const expired = () => new ApiError(401, 'La sesión terminó. Inicie sesión de nuevo.');
  const checkEpoch = (epoch: number) => { if (snapshot.epoch !== epoch) throw expired(); };
  /** Persist, then — in ONE synchronous block after the last await — re-check the epoch, adopt the
   *  tokens and publish identity, so a logout boundary can never interleave before identity lands. */
  async function save(pair: TokenPair, epoch: number, commit?: () => void) {
    const raw = JSON.stringify({ origin, pair });
    try {
      await storage(async () => {
        checkEpoch(epoch);
        await store.write(raw);
        checkEpoch(epoch);
      });
      // A boundary (logout) can land after the write but before this continuation resumes.
      checkEpoch(epoch);
    } catch (error) {
      // Stale: wipe only what THIS save wrote; a newer session's pair is a different value.
      if (snapshot.epoch !== epoch)
        await storage(async () => { if (await store.read() === raw) await store.clear(); }).catch(() => undefined);
      throw error;
    }
    tokens = pair;
    expiresAt = now() + pair.expires_in * 1000;
    commit?.();
  }
  async function invalidate(message = 'La sesión terminó. Inicie sesión de nuevo.') {
    boundary('signedOut', message);
    try { await storage(store.clear); }
    catch { publish({ message: 'No se pudo limpiar el almacenamiento seguro. Cierre y vuelva a abrir la aplicación antes de iniciar sesión.' }); }
  }
  async function signIn(mode: 'login' | 'register', email: string, password: string, acceptTerms = false) {
    if (snapshot.status !== 'signedOut') throw new ApiError(409, 'Espere a que termine la solicitud actual.');
    const epoch = boundary('busy');
    let issued: TokenPair | null = null;
    try {
      await storage(store.clear);
      issued = mode === 'login' ? await client.login(email, password) : await client.register(email, password, acceptTerms);
      checkEpoch(epoch);
      const user = await client.me(issued.access_token);
      checkEpoch(epoch);
      await save(issued, epoch, () => publish({ status: 'authenticated', user, message: null }));
    } catch (error) {
      if (issued) await client.logout(issued.refresh_token).catch(() => undefined);
      if (snapshot.epoch === epoch) await invalidate();
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, 'No se pudo guardar la sesión de forma segura. Intente de nuevo.');
    }
  }
  function refreshAccess(rejectedAccess?: string): Promise<string> {
    if (refreshFlight) return refreshFlight;
    if (!tokens || snapshot.status !== 'authenticated') return Promise.reject(expired());
    if (rejectedAccess && tokens.access_token !== rejectedAccess) return Promise.resolve(tokens.access_token);
    const epoch = snapshot.epoch;
    const old = tokens.refresh_token;
    rotatingToken = old;
    const operation = (async () => {
      let issued: TokenPair | null = null;
      try {
        // Delete BEFORE dispatch: after a crash/timeout the consumed token is never retried.
        await storage(store.clear);
        checkEpoch(epoch);
        issued = await client.refresh(old);
        checkEpoch(epoch);
        await save(issued, epoch);
        return issued.access_token;
      } catch {
        if (issued) await client.logout(issued.refresh_token).catch(() => undefined);
        if (snapshot.epoch === epoch) await invalidate();
        throw expired();
      }
    })();
    refreshFlight = operation;
    void operation.then(() => {
      if (refreshFlight === operation) { refreshFlight = null; rotatingToken = null; }
    }, () => {
      if (refreshFlight === operation) { refreshFlight = null; rotatingToken = null; }
    });
    return operation;
  }
  async function logout() {
    const refresh = tokens?.refresh_token ?? rotatingToken;
    const epoch = boundary('busy');
    let message: string | null = null;
    // Revoke in parallel with secure deletion. A consumed token also revokes its family.
    const remote = refresh ? client.logout(refresh).catch(() => {
      message = 'Sesión local cerrada; no se pudo confirmar el cierre en el servidor. Compruebe su conexión. La sesión remota puede seguir activa hasta caducar.';
    }) : Promise.resolve();
    try { await storage(store.clear); }
    catch { message = 'No se pudo limpiar el almacenamiento seguro. Cierre y vuelva a abrir la aplicación antes de iniciar sesión.'; }
    await remote;
    if (snapshot.epoch === epoch) publish({ status: 'signedOut', message });
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    hydrate: () => {
      if (hydration) return hydration;
      hydration = (async () => {
        const epoch = boundary('hydrating');
        let issued: TokenPair | null = null;
        try {
          const raw = await storage(store.read);
          await storage(store.clear);
          checkEpoch(epoch);
          if (!raw) { publish({ status: 'signedOut' }); return; }
          const saved = JSON.parse(raw) as { origin?: unknown; pair?: unknown };
          if (saved.origin !== origin) throw expired();
          const old = parsePair(saved.pair);
          rotatingToken = old.refresh_token;
          issued = await client.refresh(old.refresh_token);
          checkEpoch(epoch);
          const user = await client.me(issued.access_token);
          checkEpoch(epoch);
          await save(issued, epoch, () => publish({ status: 'authenticated', user }));
        } catch {
          if (issued) await client.logout(issued.refresh_token).catch(() => undefined);
          if (snapshot.epoch === epoch) await invalidate();
        } finally { if (snapshot.epoch === epoch) rotatingToken = null; }
      })();
      return hydration;
    },
    login: (email: string, password: string) => signIn('login', email, password),
    register: (email: string, password: string, acceptTerms: boolean) => signIn('register', email, password, acceptTerms),
    invalidate,
    checkEpoch,
    logout,
    refreshAccess,
    getAccessToken: async () => {
      if (snapshot.status !== 'authenticated') throw expired();
      if (refreshFlight) return refreshFlight;
      if (!tokens) throw expired();
      if (expiresAt <= now() + 30_000) return refreshAccess();
      return tokens.access_token;
    },
  };
}
export type AuthSession = ReturnType<typeof createAuthSession>;
