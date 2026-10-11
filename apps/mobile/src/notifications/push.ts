/**
 * ERD-ALERT-02: registro del dispositivo para avisos push (Expo). La lógica es pura (dependencias inyectadas) para poder
 * probarla; `nativeDeps()` carga `expo-notifications` bajo demanda y solo corre en el teléfono.
 *
 * SIN VERIFICAR en un dispositivo real: requiere un development/production build con credenciales FCM (Android) y APNs (iOS)
 * configuradas en EAS y `extra.eas.projectId` en la configuración de la app (cuenta del dueño; ver ERD-DEPLOY-01).
 * Sin ellas devuelve `unavailable` y la app sigue funcionando: los avisos llegan por correo y dentro de la app.
 */
export type PushOutcome = 'registered' | 'denied' | 'unavailable' | 'error';

export interface PushDeps {
  platform: 'ios' | 'android' | 'other';
  getPermission: () => Promise<'granted' | 'denied' | 'undetermined'>;
  requestPermission: () => Promise<'granted' | 'denied'>;
  getToken: () => Promise<string | null>;
  register: (token: string, platform: 'ios' | 'android') => Promise<void>;
  remove: (token: string) => Promise<void>;
}

let lastToken: string | null = null;

/** `ask`: pide el permiso del sistema si aún no se decidió (solo cuando la persona lo pidió, p. ej. al activar el interruptor). */
export async function registerForPush(deps: PushDeps, { ask }: { ask: boolean }): Promise<PushOutcome> {
  if (deps.platform === 'other') return 'unavailable';
  try {
    let permission = await deps.getPermission();
    if (permission === 'undetermined' && ask) permission = await deps.requestPermission();
    if (permission === 'denied') return 'denied';
    if (permission !== 'granted') return 'unavailable'; // sin decidir y sin permiso para preguntar: no se molesta
    const token = await deps.getToken();
    if (!token) return 'unavailable';
    await deps.register(token, deps.platform);
    lastToken = token;
    return 'registered';
  } catch {
    return 'error';
  }
}

/** Al cerrar sesión: el servidor deja de avisar a este teléfono. Nunca lanza (cerrar sesión no depende de esto). */
export async function unregisterPush(deps: Pick<PushDeps, 'remove'>): Promise<void> {
  const token = lastToken;
  lastToken = null;
  if (!token) return;
  try { await deps.remove(token); } catch { /* el token caduca solo en el servidor al fallar un envío */ }
}

export const PUSH_MESSAGES: Record<PushOutcome, string> = {
  registered: 'Listo: este teléfono recibirá los avisos importantes.',
  denied: 'El permiso de notificaciones está desactivado. Actívelo en los ajustes del teléfono para recibir avisos.',
  unavailable: 'Este teléfono no puede recibir avisos push ahora (por ejemplo, un simulador o una versión sin notificaciones). Seguirá recibiéndolos por correo y dentro de la app.',
  error: 'No se pudo activar el aviso en este teléfono. Intente de nuevo más tarde.',
};

/** Implementación real con Expo; se importa bajo demanda para que las pruebas y la web no carguen módulos nativos. */
export async function nativeDeps(api: { registerDevice: PushDeps['register']; removeDevice: PushDeps['remove'] }): Promise<PushDeps> {
  const [{ Platform }, Notifications, Constants] = await Promise.all([
    import('react-native'), import('expo-notifications'), import('expo-constants').then((m) => m.default),
  ]);
  const os = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'other';
  if (os === 'android') {
    await Notifications.setNotificationChannelAsync('alerts', { name: 'Alertas', importance: Notifications.AndroidImportance.HIGH }).catch(() => undefined);
  }
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return {
    platform: os,
    getPermission: async () => {
      const { status } = await Notifications.getPermissionsAsync();
      return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
    },
    requestPermission: async () => ((await Notifications.requestPermissionsAsync()).status === 'granted' ? 'granted' : 'denied'),
    getToken: async () => (projectId ? (await Notifications.getExpoPushTokenAsync({ projectId })).data : null),
    register: api.registerDevice,
    remove: api.removeDevice,
  };
}
