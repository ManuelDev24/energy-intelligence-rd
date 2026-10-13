import { describe, expect, it } from 'vitest';
import { localToIso, nowTimeRD, rdParts, RD_OFFSET, todayRD } from './rdTime';

describe('rdTime (UTC−4 fijo)', () => {
  it('todayRD y nowTimeRD usan la fecha de RD aunque en UTC ya sea otro día', () => {
    const lateUtc = new Date('2026-10-05T02:30:00Z'); // 4 oct, 22:30 en RD
    expect(todayRD(lateUtc)).toBe('2026-10-04');
    expect(nowTimeRD(lateUtc)).toBe('22:30');
    const earlyUtc = new Date('2026-10-04T04:00:00Z'); // medianoche exacta en RD
    expect(todayRD(earlyUtc)).toBe('2026-10-04');
    expect(nowTimeRD(earlyUtc)).toBe('00:00');
    expect(todayRD(new Date('2026-10-04T03:59:59Z'))).toBe('2026-10-03');
  });

  it('cruza fin de año y año bisiesto sin depender de la zona del equipo', () => {
    expect(todayRD(new Date('2027-01-01T03:00:00Z'))).toBe('2026-12-31');
    expect(todayRD(new Date('2028-03-01T03:59:00Z'))).toBe('2028-02-29');
  });

  it('localToIso añade el desfase -04:00 que exige la API', () => {
    expect(RD_OFFSET).toBe('-04:00');
    expect(localToIso('2026-10-04', '08:05')).toBe('2026-10-04T08:05:00-04:00');
  });

  it('rdParts convierte cualquier zona a la hora local de RD y ida y vuelta es estable', () => {
    expect(rdParts('2026-10-04T00:00:00Z')).toEqual({ date: '2026-10-03', time: '20:00' });
    expect(rdParts('2026-10-04T08:05:00-04:00')).toEqual({ date: '2026-10-04', time: '08:05' });
    expect(rdParts(localToIso('2026-10-04', '23:59'))).toEqual({ date: '2026-10-04', time: '23:59' });
  });

  it('rdParts devuelve null con texto que no es un instante', () => {
    expect(rdParts('')).toBeNull();
    expect(rdParts('no-es-fecha')).toBeNull();
  });
});
