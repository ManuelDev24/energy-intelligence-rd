import { ApiError } from '@energyrd/api-client';

// ERD-PROF-01 / ERD-SHARE-01: lógica pura de las pantallas de ajustes de cuenta y de compartir vivienda.
export interface PasswordDraft { current: string; next: string; confirmation: string }
export type PasswordField = 'current' | 'next' | 'confirmation';
export const emptyPasswordDraft: PasswordDraft = { current: '', next: '', confirmation: '' };
const len = (value: string) => Array.from(value).length;
const inRange = (value: string) => len(value) >= 12 && len(value) <= 128;

/** Primer error del formulario de cambio de contraseña (mismas reglas que la API), o null si es válido. */
export function validatePasswordDraft(draft: PasswordDraft): { field: PasswordField; message: string } | null {
  if (!inRange(draft.current)) return { field: 'current', message: 'Ingrese su contraseña actual (12 a 128 caracteres).' };
  if (!inRange(draft.next)) return { field: 'next', message: 'La nueva contraseña debe tener entre 12 y 128 caracteres.' };
  if (draft.next === draft.current) return { field: 'next', message: 'La nueva contraseña debe ser distinta de la actual.' };
  if (draft.next !== draft.confirmation) return { field: 'confirmation', message: 'Las contraseñas nuevas no coinciden.' };
  return null;
}
export const canSubmitPassword = (draft: PasswordDraft, pending: boolean) => !pending && validatePasswordDraft(draft) === null;

export const PASSWORD_CHANGED_MESSAGE = 'Contraseña cambiada. Se cerraron las demás sesiones.';
export const SESSION_LOST_MESSAGE = 'Su contraseña se cambió, pero no se pudo guardar la sesión de forma segura. Inicie sesión con la nueva contraseña.';

export interface NotificationDraft { email: boolean; push: boolean }
export const preferencesChanged = (saved: NotificationDraft, draft: NotificationDraft) => saved.email !== draft.email || saved.push !== draft.push;

export function formatSessionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'fecha desconocida';
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const two = (n: number) => String(n).padStart(2, '0');
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}, ${two(date.getHours())}:${two(date.getMinutes())}`;
}

// --- Compartir vivienda ---
export type ShareConfirm =
  | { kind: 'leave' }
  | { kind: 'remove' | 'transfer'; member: { user_id: string; email: string } };
/** 403 de las rutas de propietario = la persona es integrante, no propietaria (no es un fallo). */
export const isNotOwnerError = (error: unknown) =>
  error instanceof ApiError && error.status === 403 && error.code !== 'reauthentication_failed';
export const roleLabel = (role: 'owner' | 'member') => (role === 'owner' ? 'Propietaria' : 'Integrante');
export function confirmCopy(confirm: ShareConfirm): string {
  if (confirm.kind === 'leave') return '¿Salir de esta vivienda? Dejará de verla.';
  if (confirm.kind === 'remove') return `¿Sacar a ${confirm.member.email}? Perderá el acceso de inmediato.`;
  return `¿Transferir la propiedad a ${confirm.member.email}? Usted pasará a ser integrante y no podrá deshacerlo por su cuenta.`;
}
export const canConfirmShare = (confirm: ShareConfirm, password: string, pending: boolean) =>
  !pending && (confirm.kind !== 'transfer' || inRange(password));
export const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && len(value.trim()) <= 254;
