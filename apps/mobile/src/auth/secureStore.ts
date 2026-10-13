import * as SecureStore from 'expo-secure-store';
import type { SecureTokenStore } from './session';
const KEY = 'energyrd.auth.v1';
export const secureTokenStore: SecureTokenStore = {
  read: () => SecureStore.getItemAsync(KEY),
  write: (raw) => SecureStore.setItemAsync(KEY, raw, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
