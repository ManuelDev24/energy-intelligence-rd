import Constants from 'expo-constants';
import { Platform } from 'react-native';

const API_PORT = 8000;

const DEVELOPMENT = typeof __DEV__ !== 'undefined' && __DEV__;
// Origen HTTPS estricto: host (o IPv6 entre corchetes) y puerto opcional; sin credenciales, ruta, query ni fragmento.
const HTTPS_ORIGIN = /^https:\/\/(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*|\[[0-9a-f:.]+\])(?::\d{1,5})?\/?$/i;

export class ApiUrlConfigError extends Error {
  constructor() {
    super('Configuración inválida: EXPO_PUBLIC_API_URL debe ser un origen HTTPS explícito (https://host[:puerto]) en compilaciones de producción.');
    this.name = 'ApiUrlConfigError';
  }
}

/**
 * URL base de la API.
 * Fuera de __DEV__ (release): solo EXPO_PUBLIC_API_URL con un origen HTTPS explícito; cualquier otra
 * cosa (vacía, http://, credenciales, ruta) falla cerrado con ApiUrlConfigError. Sin fallbacks HTTP.
 * En __DEV__:
 * 1. EXPO_PUBLIC_API_URL si está definida (http permitido para APIs locales/LAN).
 * 2. En desarrollo con Expo Go: la IP LAN del servidor Metro + puerto 8000.
 * 3. Android emulador: 10.0.2.2. Resto: localhost.
 * Si no se sabe si es desarrollo, se aplica la política de producción.
 */
export function resolveApiUrl(
  env: Record<string, string | undefined> = process.env,
  hostUri: string | undefined = (Constants.expoConfig as { hostUri?: string } | null)?.hostUri,
  platform: string = Platform.OS,
  development = false,
): string {
  const explicit = env.EXPO_PUBLIC_API_URL?.trim();
  if (!development) {
    if (!explicit || !HTTPS_ORIGIN.test(explicit)) throw new ApiUrlConfigError();
    return explicit.replace(/\/+$/, '');
  }
  if (explicit) return explicit.replace(/\/+$/, '');
  const host = hostUri?.split(':')[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') return `http://${host}:${API_PORT}`;
  if (platform === 'android') return `http://10.0.2.2:${API_PORT}`;
  return `http://localhost:${API_PORT}`;
}

/** Igual que resolveApiUrl, pero devuelve el error para mostrar una pantalla en vez de cerrar la app al importar. */
export function resolveApiConfig(...args: Parameters<typeof resolveApiUrl>): { url: string | null; error: string | null } {
  try { return { url: resolveApiUrl(...args), error: null }; }
  catch (error) {
    if (error instanceof ApiUrlConfigError) return { url: null, error: error.message };
    throw error;
  }
}

// Expo statically substitutes direct EXPO_PUBLIC_* references, not process.env iteration.
export const API_CONFIG = resolveApiConfig({ EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL }, undefined, undefined, DEVELOPMENT);
/** Mal configurada en release: origen inexistente (.invalid, RFC 2606) y App muestra API_CONFIG.error sin hacer solicitudes. */
export const API_URL = API_CONFIG.url ?? 'https://api-url-not-configured.invalid';
export function resolveAuthEnabled(flag: string | undefined, development: boolean): boolean {
  return !(development && flag === 'false');
}
export const AUTH_ENABLED = resolveAuthEnabled(process.env.EXPO_PUBLIC_AUTH_ENABLED, DEVELOPMENT);
