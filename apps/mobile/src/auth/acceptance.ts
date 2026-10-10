/**
 * ERD-AUTH-03: lógica pura de aceptación de términos/privacidad en el registro móvil.
 * El cliente nunca envía la versión de términos (la fija el servidor); solo exige un
 * `true` explícito del usuario antes de intentar el registro.
 */
export const LEGAL_DRAFT_NOTICE =
  'Los Términos de Servicio y la Política de Privacidad son un borrador pendiente de revisión legal. Aun así, debe aceptarlos para crear una cuenta.';

export function requiresAcceptance(mode: 'login' | 'register', accepted: boolean): string | undefined {
  if (mode !== 'register' || accepted) return undefined;
  return 'Debe aceptar los Términos de Servicio y la Política de Privacidad para crear una cuenta.';
}
