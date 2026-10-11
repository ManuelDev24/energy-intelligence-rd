import { describe, expect, it } from 'vitest';
import { formatDuration, formatMonthKey, outageSummaryLine, outageToForm, validateOutageForm, type OutageFormValues } from './outages';

const NOW = new Date('2026-10-11T22:00:00Z');   // 18:00 en RD
const form = (over: Partial<OutageFormValues> = {}): OutageFormValues => ({
  startDate: '2026-10-11', startTime: '14:30', ongoing: false, endDate: '2026-10-11', endTime: '16:00', cause: 'utility_fault', note: '', ...over,
});

describe('registro de interrupciones (ERD-INT-01)', () => {
  it('arma los instantes con la hora de RD (UTC−4) y convierte la nota vacía en null', () => {
    const r = validateOutageForm(form({ note: '  Se fue con la lluvia  ' }), NOW);
    expect(r).toEqual({ ok: true, value: { started_at: '2026-10-11T14:30:00-04:00', ended_at: '2026-10-11T16:00:00-04:00', cause: 'utility_fault', note: 'Se fue con la lluvia' } });
    expect(validateOutageForm(form(), NOW)).toMatchObject({ ok: true, value: { note: null } });
  });

  it('«todavía sin luz» no lleva fin y no valida los campos de fin', () => {
    expect(validateOutageForm(form({ ongoing: true, endDate: '', endTime: 'xx' }), NOW)).toMatchObject({ ok: true, value: { ended_at: null } });
  });

  it('rechaza fechas y horas inválidas, el futuro, el orden invertido y más de 30 días', () => {
    const errors = (over: Partial<OutageFormValues>) => (validateOutageForm(form(over), NOW) as { errors: Record<string, string> }).errors;
    expect(errors({ startDate: '2026-02-30' }).startDate).toMatch(/Elige el día/);
    expect(errors({ startTime: '25:00' }).startTime).toMatch(/HH:MM/);
    expect(errors({ startDate: '2026-10-12', endDate: '2026-10-12' }).startDate).toMatch(/futuro/);
    expect(errors({ endTime: '14:30' }).endTime).toMatch(/después/);
    expect(errors({ endTime: '14:00' }).endTime).toMatch(/después/);
    expect(errors({ endDate: '2026-10-11', endTime: '19:00' }).endDate).toMatch(/futuro/);
    expect(errors({ startDate: '2026-08-01', endDate: '2026-09-15' }).endDate).toMatch(/30 días/);
    expect(errors({ note: 'x'.repeat(256) }).note).toMatch(/255/);
    expect(errors({ endDate: '' }).endDate).toMatch(/volvió/);
    expect(errors({ cause: 'meteorito' as never }).cause).toBeDefined();
  });

  it('acepta exactamente 30 días y 5 minutos de reloj desfasado', () => {
    expect(validateOutageForm(form({ startDate: '2026-09-01', startTime: '10:00', endDate: '2026-10-01', endTime: '10:00' }), NOW).ok).toBe(true);
    expect(validateOutageForm(form({ startDate: '2026-10-11', startTime: '18:04', ongoing: true }), NOW).ok).toBe(true);
    expect(validateOutageForm(form({ startDate: '2026-10-11', startTime: '18:06', ongoing: true }), NOW).ok).toBe(false);
  });

  it('precarga el formulario en hora de RD, también para una interrupción abierta', () => {
    expect(outageToForm({ started_at: '2026-10-11T18:30:00Z', ended_at: '2026-10-11T20:00:00Z', cause: 'weather', note: null }))
      .toMatchObject({ startDate: '2026-10-11', startTime: '14:30', endTime: '16:00', ongoing: false, note: '' });
    expect(outageToForm({ started_at: '2026-10-12T02:10:00Z', ended_at: null, cause: 'unknown', note: 'x' })).toMatchObject({ startDate: '2026-10-11', startTime: '22:10', ongoing: true });
  });

  it('formatea duraciones y meses', () => {
    expect([0, 45, 60, 120, 150, 1440, 1620].map(formatDuration)).toEqual(['0 min', '45 min', '1 h', '2 h', '2 h 30 min', '1 d', '1 d 3 h']);
    expect(formatMonthKey('2026-10')).toBe('oct 2026');
    expect(outageSummaryLine({ ongoing: false, duration_minutes: 150, cause: 'weather' })).toBe('2 h 30 min · Clima o tormenta');
    expect(outageSummaryLine({ ongoing: true, duration_minutes: null, cause: 'unknown' })).toBe('Todavía sin luz · No sé');
  });
});
