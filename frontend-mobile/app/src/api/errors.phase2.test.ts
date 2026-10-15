import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from '@energyrd/api-client';
import { guardApiErrors } from './errors';

const HOME = '11111111-1111-4111-8111-111111111111';
const EVIL = 'Bearer eyJleak <script>x</script>';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

describe('Fase 2: errores de lecturas y metas solo con texto local', () => {
  it('createReading 422: read_at/reading_kwh/note pasan por la lista permitida, con texto propio', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ code: 'validation_error', detail: [
      { loc: ['body', 'read_at'], msg: EVIL }, { loc: ['body', 'reading_kwh'], msg: EVIL }, { loc: ['body', 'note'], msg: EVIL },
      { loc: ['body', 'source'], msg: EVIL },
    ] }, 422));
    const api = guardApiErrors(createApiClient('https://api.test', fetcher));
    const error = (await api.createReading(HOME, { read_at: '2026-10-01T08:00:00-04:00', reading_kwh: '1' }).catch((e: unknown) => e)) as ApiError;
    expect(Object.keys(error.fieldErrors).sort()).toEqual(['note', 'read_at', 'reading_kwh']);
    expect(JSON.stringify([error.message, error.fieldErrors])).not.toContain('eyJleak');
    expect(error.fieldErrors.reading_kwh).toMatch(/lectura/i);
  });

  it('putGoal 422: monthly_amount_rd y monthly_kwh con texto propio', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ code: 'validation_error', detail: [
      { loc: ['body', 'monthly_amount_rd'], msg: EVIL }, { loc: ['body', 'monthly_kwh'], msg: EVIL },
    ] }, 422));
    const api = guardApiErrors(createApiClient('https://api.test', fetcher));
    const error = (await api.putGoal(HOME, { monthly_amount_rd: '1', monthly_kwh: '1' }).catch((e: unknown) => e)) as ApiError;
    expect(error.fieldErrors.monthly_amount_rd).toMatch(/RD\$/);
    expect(error.fieldErrors.monthly_kwh).toMatch(/kWh/);
    expect(JSON.stringify(error.fieldErrors)).not.toContain('eyJleak');
  });
});
