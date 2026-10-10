import { ApiError } from '@energyrd/api-client';
import { describe, expect, it } from 'vitest';
import { forgotPasswordErrorMessage, FORGOT_RATE_LIMITED_MESSAGE, NETWORK_MESSAGE } from './errors';

describe('ERD-AUTH-05 mapeo de errores de recuperación', () => {
  it('429 tiene un mensaje propio, distinto del genérico, sin detalle del servidor', () => {
    const message = forgotPasswordErrorMessage(new ApiError(429, 'bucket ip=1.2.3.4 exhausted'));
    expect(message).toBe(FORGOT_RATE_LIMITED_MESSAGE);
    expect(message).not.toContain('1.2.3.4');
    expect(message).not.toBe(forgotPasswordErrorMessage(new ApiError(500, 'x')));
  });
  it('el código rate_limited también se mapea al mensaje 429', () => {
    expect(forgotPasswordErrorMessage(new ApiError(400, 'x', {}, 'rate_limited'))).toBe(FORGOT_RATE_LIMITED_MESSAGE);
  });
  it('red, 422 y desconocidos usan texto local', () => {
    expect(forgotPasswordErrorMessage(new ApiError(0, 'raw'))).toBe(NETWORK_MESSAGE);
    expect(forgotPasswordErrorMessage(new ApiError(422, 'raw <script>'))).toMatch(/correo/i);
    for (const err of [new ApiError(500, 'Traceback'), new ApiError(418, 'teapot'), new Error('boom'), 'x'])
      expect(forgotPasswordErrorMessage(err)).toBe('No se pudo enviar la solicitud. Intente de nuevo.');
  });
});
