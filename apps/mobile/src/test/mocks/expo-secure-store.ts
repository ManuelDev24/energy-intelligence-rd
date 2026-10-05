// Simulación en memoria de expo-secure-store para Vitest (Node). El módulo real importa
// expo-modules-core, que usa el global __DEV__ de Metro y no existe en Node.
// Solo para pruebas: nunca persiste nada fuera del proceso.
const store = new Map<string, string>();

export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 'WHEN_UNLOCKED_THIS_DEVICE_ONLY';

export async function getItemAsync(key: string): Promise<string | null> {
  return store.has(key) ? (store.get(key) as string) : null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  store.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  store.delete(key);
}
