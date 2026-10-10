import { useSyncExternalStore } from 'react';
import { API_URL } from '../config';
import { queryClient } from '../api/queryClient';
import { useSession } from '../store/session';
import { createAuthClient } from './client';
import { createAuthSession } from './session';
import { secureTokenStore } from './secureStore';
/** Cliente de auth sin sesión (login/registro/refresh y, ERD-AUTH-05, recuperación de contraseña). */
export const authClient = createAuthClient(API_URL);
export const authSession = createAuthSession({
  client: authClient, origin: API_URL, store: secureTokenStore,
  onBoundary: () => {
    void queryClient.cancelQueries();
    queryClient.clear();
    useSession.getState().reset();
  },
});
export const useAuth = () => useSyncExternalStore(authSession.subscribe, authSession.getSnapshot, authSession.getSnapshot);
