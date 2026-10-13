import { beforeEach, describe, expect, it, vi } from 'vitest';
const secure = vi.hoisted(() => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only' }));
vi.mock('expo-secure-store', () => secure);
import { secureTokenStore } from './secureStore';
beforeEach(() => vi.resetAllMocks());
describe('native secure token adapter', () => {
  it('stores the pair in SecureStore, never AsyncStorage, using a single device-only key', async () => {
    secure.getItemAsync.mockResolvedValue('mock-pair');
    expect(await secureTokenStore.read()).toBe('mock-pair');
    await secureTokenStore.write('mock-pair');
    await secureTokenStore.clear();
    expect(secure.setItemAsync).toHaveBeenCalledWith('energyrd.auth.v1', 'mock-pair', { keychainAccessible: 'device-only' });
    expect(secure.deleteItemAsync).toHaveBeenCalledWith('energyrd.auth.v1');
  });
  it('does not swallow storage errors into successful persistence', async () => {
    secure.setItemAsync.mockRejectedValue(new Error('locked'));
    await expect(secureTokenStore.write('mock-pair')).rejects.toThrow('locked');
  });
});
