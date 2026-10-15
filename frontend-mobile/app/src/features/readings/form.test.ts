import { ApiError } from '@energyrd/api-client';
import { describe, expect, it } from 'vitest';

import { localApiError } from '../../api/errors';
import { lastReadingHint, normalizeDecimal, readingErrorMessage, validateReading, type ReadingFormValues } from './form';

const NOW = new Date('2026-10-04T16:00:00Z'); // 12:00 en RD
const existing = [
  { read_at: '2026-10-01T12:00:00Z', reading_kwh: '1000.00' }, // 1 oct 08:00 RD
  { read_at: '2026-10-03T12:00:00Z', reading_kwh: '1030.00' }, // 3 oct 08:00 RD
];
const ok: ReadingFormValues = { date: '2026-10-02', time: '08:00', kwh: '1015.5', note: '  ' };

describe('normalizeDecimal (mismo formato que acepta la API)', () => {
  it.each([['1015.5', '1015.5'], ['1,250.50', '1250.50'], ['1250,5', '1250.5'], ['0', '0'], [' 12 ', '12']])('%s -> %s', (a, b) =>
    expect(normalizeDecimal(a)).toBe(b));
  it.each(['', 'abc', '1.2.3', '-'])('rechaza %s', (a) => expect(normalizeDecimal(a)).toBeNull());
  // La app muestra "1,000 kWh": una coma seguida de grupos de 3 cifras es separador de miles.
  it.each([['1,000', '1000'], ['12,345,678', '12345678'], ['1,250', '1250'], ['1250,50', '1250.50'], ['1,5', '1.5']])(
    'coma de miles vs. coma decimal: %s -> %s', (a, b) => expect(normalizeDecimal(a)).toBe(b));
});

describe('validateReading', () => {
  it('construye la entrada con ISO −04:00, kWh normalizado y nota nula si está vacía', () => {
    expect(validateReading(ok, existing, NOW)).toEqual({
      errors: {},
      input: { read_at: '2026-10-02T08:00:00-04:00', reading_kwh: '1015.5', note: null },
    });
  });

  it('formatos de fecha y hora inválidos', () => {
    const { errors, input } = validateReading({ ...ok, date: '02/10/2026', time: '8h' }, existing, NOW);
    expect(input).toBeNull();
    expect(errors.date).toMatch(/AAAA-MM-DD/);
    expect(errors.time).toMatch(/HH:MM/);
  });

  it('no negativa, máximo 2 decimales y 10 enteros', () => {
    expect(validateReading({ ...ok, kwh: '-1' }, [], NOW).errors.kwh).toMatch(/negativ/);
    expect(validateReading({ ...ok, kwh: '1.234' }, [], NOW).errors.kwh).toMatch(/2 decimales/);
    expect(validateReading({ ...ok, kwh: '12345678901' }, [], NOW).errors.kwh).toMatch(/grande/);
    expect(validateReading({ ...ok, kwh: '' }, [], NOW).errors.kwh).toMatch(/número/);
  });

  it('no futura: fecha posterior a hoy o una hora aún no llegada', () => {
    expect(validateReading({ ...ok, date: '2026-10-05' }, [], NOW).errors.date).toMatch(/futura/);
    expect(validateReading({ ...ok, date: '2026-10-04', time: '12:30' }, [], NOW).errors.time).toMatch(/futura/);
    expect(validateReading({ ...ok, date: '2026-10-04', time: '11:59' }, [], NOW).input).not.toBeNull();
  });

  it('monotonía: ≥ la anterior y ≤ la siguiente en el tiempo, con el valor de referencia', () => {
    const low = validateReading({ ...ok, kwh: '999' }, existing, NOW);
    expect(low.input).toBeNull();
    expect(low.errors.kwh).toBe('Debe ser mayor o igual a la lectura anterior (1,000 kWh, 1 oct 2026, 08:00).');
    const high = validateReading({ ...ok, kwh: '1031' }, existing, NOW);
    expect(high.errors.kwh).toBe('Debe ser menor o igual a la lectura siguiente (1,030 kWh, 3 oct 2026, 08:00).');
    expect(validateReading({ ...ok, date: '2026-10-04', time: '09:00', kwh: '1030' }, existing, NOW).input).not.toBeNull();
  });

  it('mismo instante que una lectura existente', () => {
    expect(validateReading({ ...ok, date: '2026-10-01', time: '08:00', kwh: '1000' }, existing, NOW).errors.time)
      .toMatch(/Ya existe una lectura/);
  });

  it('nota opcional de hasta 255 caracteres', () => {
    expect(validateReading({ ...ok, note: 'x'.repeat(256) }, [], NOW).errors.note).toMatch(/255/);
    expect(validateReading({ ...ok, note: ' contador patio ' }, [], NOW).input?.note).toBe('contador patio');
  });
});

describe('lastReadingHint', () => {
  it('describe la lectura más reciente en hora local', () => {
    expect(lastReadingHint(existing)).toBe('Última lectura: 1,030 kWh el 3 oct 2026, 08:00. La nueva debe ser igual o mayor.');
    expect(lastReadingHint([])).toBeNull();
  });
});

describe('readingErrorMessage: solo texto local', () => {
  it('409 y 422 sin campos tienen mensajes propios de lecturas', () => {
    expect(readingErrorMessage(localApiError(409, 'x'))).toMatch(/Ya existe una lectura/);
    expect(readingErrorMessage(localApiError(422, 'x'))).toMatch(/anterior/);
  });
  it('el resto pasa por describeError (nunca Error.message arbitrario)', () => {
    expect(readingErrorMessage(new ApiError(0, 'Bearer leak'))).toMatch(/conectar/);
    expect(readingErrorMessage(new Error('Traceback'))).toBe('Ocurrió un error inesperado');
  });
});
