// ERD-INT-01 (móvil): textos del historial y resumen + estructura (no hay render de React Native en vitest).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/client';
import type { Outage, OutageSummary } from '../../api/types';
import { INVALID_MESSAGE, OVERLAP_MESSAGE, outageErrorMessage, outageRow, summaryHeadline, summaryRows } from './outagesModel';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const outage = (over: Partial<Outage> = {}): Outage => ({
  id: 'd1000000-0000-4000-8000-000000000001', home_id: '00000000-0000-0000-0000-000000000001', started_at: '2026-10-01T18:30:00Z', ended_at: '2026-10-01T21:00:00Z',
  cause: 'utility_fault', note: 'Se fue con la lluvia', source: 'manual', created_at: '2026-10-01T22:00:00Z', updated_at: '2026-10-01T22:00:00Z',
  ongoing: false, duration_minutes: 150, ...over,
});
const month = (key: string, count: number, total = count * 150, ongoing = 0) => ({ month: key, count, total_minutes: total, longest_minutes: count ? 150 : 0, average_minutes: count ? Math.round(total / count) : null, ongoing });
const summary = (months = [month('2026-09', 0), month('2026-10', 2, 300)]): OutageSummary => ({
  home_id: '00000000-0000-0000-0000-000000000001', timezone: 'America/Santo_Domingo', from_month: months[0].month, to_month: months.at(-1)!.month, months,
  totals: { count: months.reduce((a, m) => a + m.count, 0), total_minutes: months.reduce((a, m) => a + m.total_minutes, 0), longest_minutes: 150, average_minutes: 150, ongoing: 0 }, note: 'n',
});

describe('outagesModel', () => {
  it('una fila muestra el inicio y el fin en hora de RD, la duración y la causa', () => {
    const row = outageRow(outage());
    expect(row.when).toBe('1 oct 2026, 14:30 → 1 oct 2026, 17:00');
    expect(row.summary).toBe('2 h 30 min · Falla de la distribuidora');
    expect(row.accessibilityLabel).toBe('Apagón del 1 oct 2026, 14:30 → 1 oct 2026, 17:00. 2 h 30 min · Falla de la distribuidora. Se fue con la lluvia');
    expect(row.testID).toBe('outage-2026-10-01-1430');
  });

  it('un apagón abierto dice que sigue sin luz y no inventa duración', () => {
    const row = outageRow(outage({ ended_at: null, ongoing: true, duration_minutes: null, note: null }));
    expect(row.when).toBe('1 oct 2026, 14:30 → sigue sin luz');
    expect(row.summary).toBe('Todavía sin luz · Falla de la distribuidora');
    expect(row.ongoing).toBe(true);
    expect(row.accessibilityLabel).not.toContain('null');
  });

  it('el resumen va del mes más reciente al más antiguo y los meses vacíos lo dicen', () => {
    const rows = summaryRows(summary());
    expect(rows.map((r) => r.month)).toEqual(['oct 2026', 'sep 2026']);
    expect(rows[0]).toMatchObject({ text: '2 apagones · 5 h sin luz', accessibilityLabel: 'oct 2026: 2 apagones · 5 h sin luz' });
    expect(rows[1].text).toBe('Sin apagones');
    expect(summaryRows(summary([month('2026-10', 1, 90, 1)]))[0].text).toBe('1 apagón · 1 h 30 min sin luz (sigue abierto)');
    expect(summaryHeadline(summary())).toBe('2 apagones, 5 h sin luz');
    expect(summaryHeadline(summary([month('2026-10', 0)]))).toBe('Sin apagones registrados en los últimos meses');
  });

  it('el solape y las fechas inválidas tienen mensaje propio y nunca se muestra el texto del servidor', () => {
    expect(outageErrorMessage(new ApiError(409, 'TEXTO-INTERNO', {}))).toBe(OVERLAP_MESSAGE);
    expect(outageErrorMessage(new ApiError(422, 'TEXTO-INTERNO', {}))).toBe(INVALID_MESSAGE);
    expect(outageErrorMessage(new Error('TEXTO-INTERNO'))).not.toContain('TEXTO-INTERNO');
    expect(outageErrorMessage(new ApiError(500, 'TEXTO-INTERNO', {}))).not.toContain('TEXTO-INTERNO');
  });

  it('las pantallas ofrecen registrar, editar, eliminar con confirmación y cerrar un apagón abierto', () => {
    const list = read('./OutagesScreen.tsx');
    for (const id of ['add-outage', 'edit-', 'delete-', 'restore-', 'outages-empty', 'outage-summary']) expect(list).toContain(id);
    expect(list).toContain('Alert.alert(\'Eliminar apagón\'');
    expect(list).toContain('ended_at: new Date().toISOString()');
    const form = read('./OutageFormScreen.tsx');
    for (const id of ['f-outage-start-date', 'f-outage-start-time', 'f-outage-end-date', 'f-outage-end-time', 'f-outage-ongoing', 'save-outage', 'outage-server-error']) expect(form).toContain(id);
    expect(form).toContain('validateOutageForm(v)');
  });

  it('está en la navegación y se abre desde el Perfil', () => {
    const nav = read('../../navigation/AppNavigator.tsx');
    expect(nav).toContain('name="Outages"');
    expect(nav).toContain('name="OutageForm"');
    expect(nav).toContain("onOutages={() => navigation.navigate('Outages')}");
    expect(read('../profile/ProfileScreen.tsx')).toContain('testID="profile-outages"');
  });
});
