import { describe, expect, it } from 'vitest';

import { addDays, localParts, nowRD, parseTime, toReadingIso, todayRD } from './rdTime';

describe('hora de República Dominicana (UTC−4 fijo)', () => {
  it('todayRD usa la fecha local, no la UTC', () => {
    // 02:30 UTC del 5 oct = 22:30 del 4 oct en RD.
    expect(todayRD(new Date('2026-10-05T02:30:00Z'))).toBe('2026-10-04');
    expect(todayRD(new Date('2026-10-05T04:00:00Z'))).toBe('2026-10-05');
  });

  it('nowRD devuelve fecha y hora local con minutos', () => {
    expect(nowRD(new Date('2026-10-05T02:07:59Z'))).toEqual({ date: '2026-10-04', time: '22:07' });
  });

  it('addDays cruza meses y años bisiestos', () => {
    expect(addDays('2026-10-04', -6)).toBe('2026-09-28');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('parseTime acepta H:MM y HH:MM de 24 h, rechaza fuera de rango', () => {
    expect(parseTime('8:05')).toBe('08:05');
    expect(parseTime(' 23:59 ')).toBe('23:59');
    for (const bad of ['24:00', '12:60', '1230', 'ab:cd', '']) expect(parseTime(bad)).toBeNull();
  });

  it('toReadingIso arma ISO 8601 con desfase −04:00 explícito', () => {
    expect(toReadingIso('2026-10-01', '8:30')).toBe('2026-10-01T08:30:00-04:00');
    expect(Date.parse(toReadingIso('2026-10-01', '20:00') as string)).toBe(Date.parse('2026-10-02T00:00:00Z'));
    expect(toReadingIso('2026-02-30', '08:00')).toBeNull();
    expect(toReadingIso('2026-10-01', '25:00')).toBeNull();
  });

  it('localParts convierte el UTC que devuelve la API a hora local RD', () => {
    expect(localParts('2026-10-02T00:00:00Z')).toEqual({ date: '2026-10-01', time: '20:00', label: '1 oct 2026, 20:00' });
    expect(localParts('2026-10-01T08:30:00-04:00')?.label).toBe('1 oct 2026, 08:30');
    expect(localParts('no-es-fecha')).toBeNull();
  });
});
