import { describe, expect, it, vi } from 'vitest';
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(async () => null), setItemAsync: vi.fn(async () => {}), deleteItemAsync: vi.fn(async () => {}), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only' }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(async () => JSON.stringify({ selectedHomeId: 'old-pilot', onboardingDone: true })), setItem: vi.fn(), removeItem: vi.fn(async () => {}) } }));
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authSession } from './runtime';
import { queryClient } from '../api/queryClient';
import { useSession } from '../store/session';
describe('account isolation integration', () => {
  it('does not hydrate auth homes from the legacy pilot storage', async () => {
    await useSession.getState().hydrate();
    expect(useSession.getState()).toMatchObject({ selectedHomeId: null, onboardingDone: false, hydrated: true });
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  });
  it('clears all queries and selected home/onboarding at account boundaries', async () => {
    useSession.getState().selectHome('old-private-home');
    useSession.getState().completeOnboarding();
    queryClient.setQueryData(['homes'], ['private-home']);
    queryClient.setQueryData(['dashboard', 'old-private-home'], { private: true });
    await authSession.invalidate();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(useSession.getState()).toMatchObject({ selectedHomeId: null, onboardingDone: false });
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});
