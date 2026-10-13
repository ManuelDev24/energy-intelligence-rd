import { ApiError } from '@energyrd/api-client';

/**
 * ERD-AUTH-03: lógica pura de la eliminación de cuenta (zona de peligro del perfil).
 * Dos pasos explícitos (abrir -> confirmar con contraseña) para que nunca se borre con un
 * solo toque, y una función de envío que impide el doble submit mientras hay una solicitud
 * en curso.
 */
export type DeletionStep = 'closed' | 'confirm';
export interface DeletionDraft {
  step: DeletionStep;
  password: string;
}
export const initialDeletionDraft: DeletionDraft = { step: 'closed', password: '' };

export function validateDeletionPassword(password: string): string | undefined {
  const length = Array.from(password).length;
  if (length < 12 || length > 128) return 'Ingrese su contraseña actual (12 a 128 caracteres).';
  return undefined;
}

/** Bloquea el envío mientras hay una solicitud pendiente o la contraseña no es válida. */
export function canSubmitDeletion(password: string, pending: boolean): boolean {
  return !pending && validateDeletionPassword(password) === undefined;
}

export function isReauthenticationFailed(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'reauthentication_failed';
}
export function isOwnershipTransferRequired(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'ownership_transfer_required';
}
