import { ApiError } from '@energyrd/api-client';
import { FORGOT_INVALID_EMAIL_MESSAGE, forgotPasswordErrorMessage } from '../../api/errors';
import { isValidEmail } from '../../auth/client';

/** ERD-AUTH-05: misma confirmación SIEMPRE (exista o no la cuenta) para no enumerar correos. */
export const FORGOT_CONFIRMATION =
  'Si existe una cuenta con ese correo, te enviamos un enlace para restablecerla. Ábrelo en este teléfono; caduca en 30 minutos.';

export const validateForgotEmail = (email: string): string | undefined =>
  isValidEmail(email) ? undefined : FORGOT_INVALID_EMAIL_MESSAGE;

export interface ForgotState {
  status: 'idle' | 'submitting' | 'sent';
  /** Mensaje local (nunca texto del servidor). */
  error: string | null;
  fieldError: string | null;
}
export type ForgotEvent =
  | { type: 'submit' }
  | { type: 'invalid'; fieldError: string }
  | { type: 'succeeded' }
  | { type: 'failed'; error: unknown }
  | { type: 'edited' };

export const initialForgotState: ForgotState = { status: 'idle', error: null, fieldError: null };

export function forgotReducer(state: ForgotState, event: ForgotEvent): ForgotState {
  switch (event.type) {
    case 'submit':
      return state.status === 'idle' ? { status: 'submitting', error: null, fieldError: null } : state;
    case 'invalid':
      return state.status === 'idle' ? { status: 'idle', error: null, fieldError: event.fieldError } : state;
    case 'succeeded':
      return state.status === 'submitting' ? { status: 'sent', error: null, fieldError: null } : state;
    case 'failed': {
      if (state.status !== 'submitting') return state;
      if (event.error instanceof ApiError && event.error.status === 422)
        return { status: 'idle', error: null, fieldError: FORGOT_INVALID_EMAIL_MESSAGE };
      return { status: 'idle', error: forgotPasswordErrorMessage(event.error), fieldError: null };
    }
    case 'edited':
      return state.status === 'idle' && (state.error || state.fieldError) ? initialForgotState : state;
  }
}

/** Envío con una sola solicitud en vuelo (sin doble envío aunque se pulse varias veces). */
export function createForgotSubmitter(send: (email: string) => Promise<void>, dispatch: (event: ForgotEvent) => void) {
  let inFlight = false;
  return async (email: string): Promise<boolean> => {
    if (inFlight) return false;
    const fieldError = validateForgotEmail(email);
    if (fieldError) { dispatch({ type: 'invalid', fieldError }); return false; }
    inFlight = true;
    dispatch({ type: 'submit' });
    try {
      await send(email);
      dispatch({ type: 'succeeded' });
      return true;
    } catch (error) {
      dispatch({ type: 'failed', error });
      return false;
    } finally { inFlight = false; }
  };
}
