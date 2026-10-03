import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = 8000;

/**
 * URL base de la API.
 * 1. EXPO_PUBLIC_API_URL si está definida (recomendado para dispositivos físicos / staging).
 * 2. En desarrollo con Expo Go: la IP LAN del servidor Metro + puerto 8000.
 * 3. Android emulador: 10.0.2.2. Resto: localhost.
 */
export function resolveApiUrl(
  env: Record<string, string | undefined> = process.env,
  hostUri: string | undefined = (Constants.expoConfig as { hostUri?: string } | null)?.hostUri,
  platform: string = Platform.OS,
): string {
  const explicit = env.EXPO_PUBLIC_API_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const host = hostUri?.split(':')[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') return `http://${host}:${API_PORT}`;
  if (platform === 'android') return `http://10.0.2.2:${API_PORT}`;
  return `http://localhost:${API_PORT}`;
}

export const API_URL = resolveApiUrl();
