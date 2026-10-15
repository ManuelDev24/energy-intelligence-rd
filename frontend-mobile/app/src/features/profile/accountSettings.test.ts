import { ApiError } from '@energyrd/api-client';
import { describe, expect, it } from 'vitest';
import {
  canConfirmShare, canSubmitPassword, confirmCopy, formatSessionDate, isNotOwnerError, looksLikeEmail, preferencesChanged,
  roleLabel, validatePasswordDraft,
} from './accountSettings';

const OLD = 'valid-test-password-123';
const NEW = 'another-new-password-789';

describe('cambio de contraseña', () => {
  it('acepta una nueva distinta, confirmada y en rango', () => {
    expect(validatePasswordDraft({ current: OLD, next: NEW, confirmation: NEW })).toBeNull();
    expect(canSubmitPassword({ current: OLD, next: NEW, confirmation: NEW }, false)).toBe(true);
  });
  it.each([
    [{ current: 'corta', next: NEW, confirmation: NEW }, 'current'],
    [{ current: OLD, next: 'corta', confirmation: 'corta' }, 'next'],
    [{ current: OLD, next: OLD, confirmation: OLD }, 'next'],
    [{ current: OLD, next: NEW, confirmation: NEW + 'x' }, 'confirmation'],
    [{ current: OLD, next: 'x'.repeat(129), confirmation: 'x'.repeat(129) }, 'next'],
  ])('rechaza %j señalando el campo %s', (draft, field) => {
    expect(validatePasswordDraft(draft)?.field).toBe(field);
    expect(canSubmitPassword(draft, false)).toBe(false);
  });
  it('mide en puntos de código y bloquea mientras hay una solicitud en curso', () => {
    expect(validatePasswordDraft({ current: OLD, next: '😀'.repeat(12), confirmation: '😀'.repeat(12) })).toBeNull();
    expect(validatePasswordDraft({ current: OLD, next: '😀'.repeat(11), confirmation: '😀'.repeat(11) })?.field).toBe('next');
    expect(canSubmitPassword({ current: OLD, next: NEW, confirmation: NEW }, true)).toBe(false);
  });
});

describe('preferencias y sesiones', () => {
  it('detecta cambios en las preferencias', () => {
    expect(preferencesChanged({ email: true, push: true }, { email: true, push: true })).toBe(false);
    expect(preferencesChanged({ email: true, push: true }, { email: false, push: true })).toBe(true);
  });
  it('formatea la fecha de una sesión y tolera valores inválidos', () => {
    expect(formatSessionDate('2026-10-10T16:05:00-04:00')).toMatch(/^\d{1,2} oct 2026, \d{2}:\d{2}$/);
    expect(formatSessionDate('no-es-fecha')).toBe('fecha desconocida');
  });
});

describe('compartir vivienda', () => {
  const member = { user_id: '22222222-2222-4222-8222-222222222222', email: 'bob@example.com' };
  it('distingue "no es propietaria" (403) de una contraseña incorrecta (403) y de otros errores', () => {
    expect(isNotOwnerError(new ApiError(403, 'x', {}, 'forbidden'))).toBe(true);
    expect(isNotOwnerError(new ApiError(403, 'x', {}, 'reauthentication_failed'))).toBe(false);
    expect(isNotOwnerError(new ApiError(404, 'x'))).toBe(false);
    expect(isNotOwnerError(new Error('x'))).toBe(false);
  });
  it('explica cada confirmación con la persona afectada', () => {
    expect(confirmCopy({ kind: 'leave' })).toMatch(/Salir de esta vivienda/);
    expect(confirmCopy({ kind: 'remove', member })).toContain('bob@example.com');
    expect(confirmCopy({ kind: 'transfer', member })).toMatch(/Transferir la propiedad a bob@example.com/);
  });
  it('transferir exige contraseña válida; salir y sacar no', () => {
    expect(canConfirmShare({ kind: 'transfer', member }, 'corta', false)).toBe(false);
    expect(canConfirmShare({ kind: 'transfer', member }, OLD, false)).toBe(true);
    expect(canConfirmShare({ kind: 'transfer', member }, OLD, true)).toBe(false);
    expect(canConfirmShare({ kind: 'leave' }, '', false)).toBe(true);
    expect(canConfirmShare({ kind: 'remove', member }, '', false)).toBe(true);
    expect(canConfirmShare({ kind: 'leave' }, '', true)).toBe(false);
  });
  it('etiqueta los roles y valida el correo', () => {
    expect(roleLabel('owner')).toBe('Propietaria');
    expect(roleLabel('member')).toBe('Integrante');
    expect(looksLikeEmail(' a@b.co ')).toBe(true);
    for (const bad of ['', 'a', 'a@b', '@b.co', 'a b@c.co']) expect(looksLikeEmail(bad)).toBe(false);
  });
});
