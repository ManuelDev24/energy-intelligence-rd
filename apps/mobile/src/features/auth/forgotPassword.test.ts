import { ApiError } from '@energyrd/api-client';
import { describe, expect, it, vi } from 'vitest';
import { FORGOT_RATE_LIMITED_MESSAGE } from '../../api/errors';
import {
  FORGOT_CONFIRMATION, createForgotSubmitter, forgotReducer, initialForgotState, validateForgotEmail,
} from './forgotPassword';

describe('validateForgotEmail', () => {
  it('acepta correos válidos (con espacios alrededor) y rechaza vacíos/malformados/largos', () => {
    expect(validateForgotEmail(' a@b.com ')).toBeUndefined();
    for (const bad of ['', '   ', 'a@b', 'a b@c.com', '@b.com', `${'a'.repeat(250)}@b.co`])
      expect(validateForgotEmail(bad)).toBe('Ingrese un correo válido (máximo 254 caracteres).');
  });
});

describe('forgotReducer', () => {
  it('idle → submitting → sent siempre con la misma confirmación', () => {
    const submitting = forgotReducer(initialForgotState, { type: 'submit' });
    expect(submitting.status).toBe('submitting');
    const sent = forgotReducer(submitting, { type: 'succeeded' });
    expect(sent).toEqual({ status: 'sent', error: null, fieldError: null });
    expect(FORGOT_CONFIRMATION).toBe('Si existe una cuenta con ese correo, te enviamos un enlace para restablecerla. Ábrelo en este teléfono; caduca en 30 minutos.');
  });
  it('ignora submit mientras está enviando o ya enviado (sin doble envío)', () => {
    const submitting = forgotReducer(initialForgotState, { type: 'submit' });
    expect(forgotReducer(submitting, { type: 'submit' })).toBe(submitting);
    const sent = forgotReducer(submitting, { type: 'succeeded' });
    expect(forgotReducer(sent, { type: 'submit' })).toBe(sent);
  });
  it('invalid deja error de campo; failed muestra mensaje local; editar limpia errores', () => {
    const invalid = forgotReducer(initialForgotState, { type: 'invalid', fieldError: 'campo' });
    expect(invalid).toEqual({ status: 'idle', error: null, fieldError: 'campo' });
    const failed = forgotReducer(forgotReducer(initialForgotState, { type: 'submit' }), { type: 'failed', error: new ApiError(429, 'upstream') });
    expect(failed).toEqual({ status: 'idle', error: FORGOT_RATE_LIMITED_MESSAGE, fieldError: null });
    expect(forgotReducer(failed, { type: 'edited' })).toEqual(initialForgotState);
  });
  it('un 422 del servidor se muestra como error del campo correo', () => {
    const failed = forgotReducer({ ...initialForgotState, status: 'submitting' }, { type: 'failed', error: new ApiError(422, 'x', { email: 'upstream detail' }) });
    expect(failed.fieldError).toBe('Ingrese un correo válido (máximo 254 caracteres).');
    expect(failed.error).toBeNull();
  });
  it('las respuestas que llegan fuera de submitting se ignoran', () => {
    expect(forgotReducer(initialForgotState, { type: 'succeeded' })).toBe(initialForgotState);
    expect(forgotReducer(initialForgotState, { type: 'failed', error: new Error('x') })).toBe(initialForgotState);
  });
});

describe('createForgotSubmitter', () => {
  it('una sola solicitud en vuelo; pulsaciones repetidas no llaman de nuevo', async () => {
    let release!: () => void;
    const send = vi.fn(() => new Promise<void>((done) => { release = done; }));
    const dispatch = vi.fn();
    const submit = createForgotSubmitter(send, dispatch);
    const first = submit('a@b.com');
    const second = submit('a@b.com');
    expect(await second).toBe(false);
    release();
    expect(await first).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls.map(([e]) => e.type)).toEqual(['submit', 'succeeded']);
  });
  it('correo inválido no llama a la red', async () => {
    const send = vi.fn();
    const dispatch = vi.fn();
    expect(await createForgotSubmitter(send, dispatch)('mal')).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: 'invalid', fieldError: expect.any(String) });
  });
  it('tras un fallo permite reintentar', async () => {
    const send = vi.fn().mockRejectedValueOnce(new ApiError(0, 'x')).mockResolvedValueOnce(undefined);
    const dispatch = vi.fn();
    const submit = createForgotSubmitter(send, dispatch);
    expect(await submit('a@b.com')).toBe(false);
    expect(await submit('a@b.com')).toBe(true);
    expect(dispatch.mock.calls.map(([e]) => e.type)).toEqual(['submit', 'failed', 'submit', 'succeeded']);
  });
});
