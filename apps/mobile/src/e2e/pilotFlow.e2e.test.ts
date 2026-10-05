/**
 * ERD-MOB-QUALITY — recorrido del piloto contra la API REAL, usando el mismo cliente que la app.
 * vivienda → factura → historial → dashboard → alerta (leer/descartar) → equipos/estimado.
 *
 * Se omite salvo que exista MOBILE_E2E_API_URL (p. ej. http://localhost:8000) con la API sembrada.
 * Deja la base como estaba: borra la factura y el equipo que crea.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { api as ApiType } from '../api/client';
import type { Bill, Home } from '../api/types';

const URL = process.env.MOBILE_E2E_API_URL;
const run = URL ? describe : describe.skip;

run('recorrido piloto contra API real', () => {
  let api: typeof ApiType;
  let homes: Home[];
  let home: Home;
  let created: Bill | null = null;
  let equipmentId: string | null = null;

  beforeAll(async () => {
    // El piloto corre en Metro (__DEV__) con autenticación desactivada; en Node no existe __DEV__,
    // así que se reproduce ese modo explícitamente antes de importar el cliente.
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    process.env.EXPO_PUBLIC_AUTH_ENABLED = 'false';
    process.env.EXPO_PUBLIC_API_URL = URL;
    ({ api } = await import('../api/client'));
    homes = await api.listHomes();
    home = homes.find((h) => h.code === 'PILOT-05') as Home;
  });

  afterAll(async () => {
    if (created) await api.deleteBill(home.id, created.id).catch(() => undefined);
    if (equipmentId) await api.deleteEquipment(home.id, equipmentId).catch(() => undefined);
  });

  it('1. lista las 5 viviendas piloto y cada una tiene su propio dashboard', async () => {
    const codes = homes.map((h) => h.code).filter(Boolean).sort();
    expect(codes).toEqual(['PILOT-01', 'PILOT-02', 'PILOT-03', 'PILOT-04', 'PILOT-05']);
    const dashboards = await Promise.all(homes.map((h) => api.getDashboard(h.id)));
    for (const [i, d] of dashboards.entries()) {
      expect(d.home.id).toBe(homes[i].id);
      expect(d.data_status.resolution).toBe('monthly');
      expect(d.data_status.hourly_data_available).toBe(false);
    }
  });

  it('2. estado inicial de PILOT-05: 2 facturas, sin alerta', async () => {
    const d = await api.getDashboard(home.id);
    expect(d.data_status.bills_count).toBe(2);
    expect(d.alert).toBeNull();
    expect(await api.listAlerts(home.id)).toEqual([]);
  });

  it('3. rechaza una factura inválida con errores por campo', async () => {
    await expect(
      api.createBill(home.id, { period_start: '2026-08-01', period_end: '2026-08-31', kwh: '-1', amount_dop: '10', days: 31 }),
    ).rejects.toMatchObject({ status: 422, fieldErrors: { kwh: expect.any(String) } });
  });

  it('4. registra una factura y aparece en el historial', async () => {
    created = await api.createBill(home.id, {
      period_start: '2026-08-01', period_end: '2026-08-31', kwh: '400', amount_dop: '5200', days: 31,
    });
    expect(created.source).toBe('manual');
    const bills = await api.listBills(home.id);
    expect(bills.map((b) => b.id)).toContain(created.id);
    expect(bills.every((b) => b.home_id === home.id)).toBe(true);
  });

  it('5. el dashboard refleja la factura con etiquetas de calidad y alerta crítica', async () => {
    const d = await api.getDashboard(home.id);
    expect(d.latest_bill?.bill_id).toBe(created?.id);
    expect(d.latest_bill?.kwh).toMatchObject({ value: '400.00', quality: 'REAL' });
    expect(d.comparison?.kwh_pct).toMatchObject({ value: '66.67', quality: 'REAL' });
    expect(d.projection?.kwh.quality).toBe('PROJECTED');
    expect(d.alert?.severity).toBe('critical');
    expect(d.data_status.data_source).toBe('mixed');
  });

  it('6. la alerta se persiste como no leída y se puede leer y descartar', async () => {
    const [alert] = await api.listAlerts(home.id);
    expect(alert).toMatchObject({ severity: 'critical', status: 'unread', bill_id: created?.id, basis_period_start: '2026-07-01' });
    expect((await api.setAlertStatus(home.id, alert.id, 'read')).status).toBe('read');
    expect((await api.setAlertStatus(home.id, alert.id, 'dismissed')).status).toBe('dismissed');
    expect(await api.listAlerts(home.id)).toEqual([]);
  });

  it('7. equipos: alta, estimado ESTIMATED y validación', async () => {
    await expect(api.createEquipment(home.id, { name: 'X', room: null, power_w: '-5', hours_per_day: '1' }))
      .rejects.toMatchObject({ status: 422 });
    const before = await api.getEstimate(home.id);
    const e = await api.createEquipment(home.id, { name: 'Abanico E2E', room: 'Sala', power_w: '100', hours_per_day: '10' });
    equipmentId = e.id;
    const after = await api.getEstimate(home.id);
    expect(after.equipment_count).toBe(before.equipment_count + 1);
    expect(Number(after.total_monthly_kwh.value) - Number(before.total_monthly_kwh.value)).toBeCloseTo(30, 2);
    expect(after.total_monthly_kwh.quality).toBe('ESTIMATED');
  });

  it('8. borrar la factura elimina su alerta y restaura el estado', async () => {
    await api.deleteBill(home.id, (created as Bill).id);
    created = null;
    const d = await api.getDashboard(home.id);
    expect(d.data_status.bills_count).toBe(2);
    expect(d.alert).toBeNull();
  });
});
