/**
 * ERD-CONS-01 / ERD-GOAL-01 — recorrido de Fase 2 del móvil contra la API REAL dedicada (:8011),
 * con el mismo cliente protegido de la app (guardApiErrors) y la misma lógica pura de las pantallas.
 * cuenta nueva → vivienda → lecturas → consumo día/mes → meta → progreso → borrar lectura → limpieza.
 *
 * Se omite salvo AUTH_E2E_API_URL=http://127.0.0.1:8011 (cuenta y vivienda desechables).
 * PHASE2_PILOT_PROBE_URL=http://127.0.0.1:8000 añade una sonda SOLO DE LECTURA a la API piloto
 * (sin Fase 2) para comprobar que la tarjeta de meta la trata como "no disponible".
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { ApiError, createApiClient } from '@energyrd/api-client';
import { describe, expect, it } from 'vitest';

import { describeError, guardApiErrors } from '../api/errors';
import { createHomeApi } from '../api/homes';
import { createAuthClient } from '../auth/client';
import { createAuthSession } from '../auth/session';
import { createAuthenticatedFetch } from '../auth/transport';
import { layoutNullableBars } from '../components/charts/chartMath';
import { bucketValues, consumptionNotices } from '../features/consumption/model';
import { rangeForPreset } from '../features/consumption/range';
import { validateGoal } from '../features/goals/form';
import { goalCardModel, isEndpointUnavailable } from '../features/goals/model';
import { readingErrorMessage, validateReading } from '../features/readings/form';

const url = process.env.AUTH_E2E_API_URL;
if (url && !['http://127.0.0.1:8011', 'http://localhost:8011'].includes(url))
  throw new Error('AUTH_E2E_API_URL must identify the dedicated localhost:8011 integration API.');
const pilot = process.env.PHASE2_PILOT_PROBE_URL;
if (pilot && !['http://127.0.0.1:8000', 'http://localhost:8000'].includes(pilot))
  throw new Error('PHASE2_PILOT_PROBE_URL must be the local pilot API (read-only probe).');

(url ? describe : describe.skip)('Fase 2 móvil contra la API dedicada', () => {
  it('lecturas → consumo día/mes con huecos → meta → progreso con tarifa → borrar', async () => {
    const client = createAuthClient(url!);
    let persisted: string | null = null;
    const session = createAuthSession({ client, origin: url!, store: {
      read: async () => persisted, write: async (raw) => { persisted = raw; }, clear: async () => { persisted = null; },
    }, onBoundary: () => undefined });
    const transport = createAuthenticatedFetch(session);
    const api = guardApiErrors({ ...createApiClient(url!, transport), ...createHomeApi(url!, transport) });
    let homeId: string | null = null;
    try {
      await session.hydrate();
      await session.register(`mobile-phase2-${randomUUID()}@example.com`, randomBytes(24).toString('base64url'), true);
      const home = await api.createHome({ name: 'Mobile phase2 e2e', distributor: 'EDESUR' });
      homeId = home.id;
      const now = new Date();

      // Sin lecturas: consumo vacío (null, nunca 0) y progreso sin meta.
      const empty = await api.getConsumption(home.id, { granularity: 'day', from: '2026-09-28', to: '2026-10-03' });
      expect(consumptionNotices(empty)).toMatchObject({ noData: true, gaps: 6 });
      expect(bucketValues(empty.buckets).every((v) => v === null)).toBe(true);
      expect(await api.getGoal(home.id)).toBeNull();
      expect(goalCardModel(await api.getGoalProgress(home.id, { on: '2026-10-03' })).kind).toBe('no_goal');

      // Lecturas a través de la misma validación del formulario (ISO con −04:00).
      const values = [
        { date: '2026-09-20', time: '08:00', kwh: '900', note: '' },
        { date: '2026-10-01', time: '08:00', kwh: '1,000', note: 'inicio de mes' },
        { date: '2026-10-03', time: '20:00', kwh: '1030.5', note: '' },
        { date: '2026-10-02', time: '8:00', kwh: '1012.25', note: '' }, // intercalada: entre la anterior y la siguiente
      ];
      for (const v of values) {
        const { errors, input } = validateReading(v, await api.listReadings(home.id), now);
        expect(errors).toEqual({});
        expect(input?.read_at).toMatch(/-04:00$/);
        await api.createReading(home.id, input!);
      }
      const readings = await api.listReadings(home.id);
      expect(readings.map((r) => r.reading_kwh)).toEqual(['1030.50', '1012.25', '1000.00', '900.00']); // más reciente primero

      // La validación local detecta lo mismo que la API rechaza (monotonía, futura, duplicada).
      const lower = { date: '2026-10-02', time: '12:00', kwh: '990', note: '' };
      expect(validateReading(lower, readings, now).errors.kwh).toMatch(/anterior/);
      const rejected = await api.createReading(home.id, { read_at: '2026-10-02T12:00:00-04:00', reading_kwh: '990' }).catch((e: unknown) => e);
      expect(rejected).toBeInstanceOf(ApiError);
      expect((rejected as ApiError).status).toBe(422);
      expect(readingErrorMessage(rejected)).toMatch(/anterior|Revise/);
      const future = new Date(now.getTime() + 2 * 86400_000).toISOString().replace('Z', '+00:00');
      const futureErr = await api.createReading(home.id, { read_at: future, reading_kwh: '2000' }).catch((e: unknown) => e) as ApiError;
      expect(futureErr.status).toBe(422);
      const dup = await api.createReading(home.id, { read_at: '2026-10-01T08:00:00-04:00', reading_kwh: '1000' }).catch((e: unknown) => e) as ApiError;
      expect([409, 422]).toContain(dup.status);
      expect(describeError(dup).message).not.toMatch(/Traceback|detail/);

      // Consumo diario con huecos: antes de la primera lectura no hay dato (null), nunca 0.
      const day = await api.getConsumption(home.id, { granularity: 'day', from: '2026-09-10', to: '2026-10-03' });
      expect(day.buckets).toHaveLength(24);
      const dv = bucketValues(day.buckets);
      expect(dv.slice(0, 10).every((v) => v === null)).toBe(true);
      expect(day.buckets[0]).toMatchObject({ kwh: null, quality: null, reason_code: 'no_coverage' });
      expect(dv.slice(10).every((v) => v !== null && v >= 0)).toBe(true);
      const notices = consumptionNotices(day);
      expect(notices.noData).toBe(false);
      expect(notices.gaps).toBeGreaterThanOrEqual(10);
      expect(Number(day.totals.kwh?.value)).toBeGreaterThan(0);
      expect(['REAL', 'ESTIMATED']).toContain(day.totals.kwh?.quality);
      expect(day.average_daily_kwh?.quality).toBe('ESTIMATED');
      expect(day.peak_bucket?.kwh).not.toBeNull();
      const bars = layoutNullableBars(dv, 320, 180);
      expect(bars.filter((b) => b.gap).length).toBe(dv.filter((v) => v === null).length);

      // Consumo mensual del preset "12 meses": rango ≤ 366 días aceptado por la API.
      const r12 = rangeForPreset('12m', '2026-10-03');
      const month = await api.getConsumption(home.id, { granularity: 'month', ...r12 });
      expect(month.buckets).toHaveLength(12);
      expect(month.buckets.slice(0, 10).every((b) => b.kwh === null)).toBe(true); // nov 2025–ago 2026 sin lecturas
      expect(Number(month.buckets[11].kwh)).toBeGreaterThan(0); // oct 2026
      expect(Number(month.totals.kwh?.value)).toBeCloseTo(130.5, 1);

      // Meta mensual (RD$ y kWh) a través de la validación del formulario.
      const goalInput = validateGoal({ amount: '3,000', kwh: '300' }).input!;
      const saved = await api.putGoal(home.id, goalInput);
      expect(saved).toMatchObject({ monthly_amount_rd: '3000.00', monthly_kwh: '300.00' });
      expect(await api.getGoal(home.id)).toMatchObject({ monthly_kwh: '300.00' });

      // Progreso de octubre: kWh desde lecturas, RD$ con la tarifa SIE vigente (ESTIMADO) y proyección.
      const progress = await api.getGoalProgress(home.id, { on: '2026-10-03' });
      expect(progress.data_source).toBe('readings');
      expect(progress.amount?.basis).toBe('tariff');
      expect(progress.amount?.tariff?.source_resolution).toBe('SIE-121-2026-TF');
      const card = goalCardModel(progress);
      if (card.kind !== 'progress') throw new Error('expected progress');
      const amount = card.metrics.find((m) => m.key === 'amount')!;
      const kwh = card.metrics.find((m) => m.key === 'kwh')!;
      expect(amount.note).toEqual({ text: 'Estimado con tarifa SIE-121-2026-TF', quality: 'ESTIMATED' });
      expect(amount.soFarQuality).toBe('ESTIMATED');
      expect(kwh.soFar).toMatch(/kWh$/);
      expect(kwh.projected).toMatch(/kWh$/);
      expect(progress.kwh?.projected?.quality).toBe('PROJECTED');
      expect(['on_track', 'at_risk', 'exceeded']).toContain(progress.status);
      expect(card.status.label.length).toBeGreaterThan(0);

      // Un mes sin datos: insufficient_data con motivos locales y CTA de lectura/factura.
      const august = goalCardModel(await api.getGoalProgress(home.id, { on: '2026-08-15' }));
      if (august.kind !== 'progress') throw new Error('expected progress');
      expect(august.status.label).toBe('Datos insuficientes');
      expect(august.ctas).toEqual(['add_reading', 'add_bill']);
      expect(august.metrics[0].reasons.length).toBeGreaterThan(0);

      // Borrar una lectura recalcula el consumo.
      const last = readings[0];
      await api.deleteReading(home.id, last.id);
      expect((await api.listReadings(home.id)).map((r) => r.id)).not.toContain(last.id);
      const after = await api.getConsumption(home.id, { granularity: 'month', ...r12 });
      expect(Number(after.totals.kwh?.value)).toBeCloseTo(112.25, 1);
    } finally {
      if (homeId && session.getSnapshot().status === 'authenticated')
        await transport(`${url}/api/v1/homes/${homeId}`, { method: 'DELETE' });
      if (session.getSnapshot().status === 'authenticated') await session.logout();
    }
  }, 60_000);
});

(pilot ? describe : describe.skip)('API piloto sin Fase 2 (solo lectura)', () => {
  it('meta/consumo/lecturas responden 404 y la app los trata como "no disponible"', async () => {
    const api = guardApiErrors(createApiClient(pilot!));
    const [home] = await api.listHomes();
    expect(home).toBeDefined();
    for (const call of [
      () => api.getGoalProgress(home.id),
      () => api.getConsumption(home.id, { granularity: 'day', from: '2026-09-28', to: '2026-10-04' }),
      () => api.listReadings(home.id),
    ]) {
      const error = await call().catch((e: unknown) => e);
      expect(isEndpointUnavailable(error)).toBe(true);
    }
    // El dashboard existente sigue respondiendo.
    expect((await api.getDashboard(home.id)).home.id).toBe(home.id);
  }, 30_000);
});
