import { useSyncExternalStore } from 'react';
import { API_URL } from '../config';
import { queryClient } from '../api/queryClient';
import { useSession } from '../store/session';
import { createAuthClient } from './client';
import { createAuthSession } from './session';
import { secureTokenStore } from './secureStore';
export const authSession = createAuthSession({
  client: createAuthClient(API_URL), origin: API_URL, store: secureTokenStore,
  onBoundary: () => {
    void queryClient.cancelQueries();
    queryClient.clear();
    useSession.getState().reset();
  },
});
export const useAuth = () => useSyncExternalStore(authSession.subscribe, authSession.getSnapshot, authSession.getSnapshot);
