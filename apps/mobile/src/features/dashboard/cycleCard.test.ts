// ERD-CHARTS-01 (móvil): ciclo actual, enlace de investigación y rango inicial de Consumo.
import { readFileSync } from 'node:fs';
import { currentCycle } from '@energyrd/core';
import { describe, expect, it } from 'vitest';

import { cyclePercent, cycleProgressText } from './cycle';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const bill = { period_start: '2026-09-01', period_end: '2026-09-30', days: 30 };

describe('ciclo actual', () => {
  it('ciclo activo: día transcurrido y porcentaje', () => {
    const c = currentCycle(bill, '2026-10-10');
    expect(c.state).toBe('active');
    expect(cycleProgressText(c)).toBe(`Día ${c.elapsed} de ${c.days}`);
    expect(cyclePercent(c)).toBe(Math.round((c.elapsed / c.days) * 100));
  });
  it('ciclo por empezar: 0 % y sin consulta de consumo', () => {
    const c = currentCycle(bill, '2026-09-30');
    expect(c.state).toBe('upcoming');
    expect(cyclePercent(c)).toBe(0);
    expect(c.range).toBeNull();
    expect(cycleProgressText(c)).toContain('empieza el');
  });
  it('ciclo vencido: pide registrar la factura y no pasa de 100 %', () => {
    const c = currentCycle(bill, '2027-01-15');
    expect(c.state).toBe('overdue');
    expect(cyclePercent(c)).toBeLessThanOrEqual(100);
    expect(cycleProgressText(c)).toContain('registre la factura');
  });
});

describe('estructura móvil de CHARTS-01', () => {
  it('la tarjeta de ciclo solo consulta con rango, no inventa valores y se muestra en el panel', () => {
    const card = read('./CycleCard.tsx');
    expect(card).toContain("cycle.range?.from ?? null");
    expect(card).toContain('Aún no hay lecturas que cubran este ciclo.');
    expect(card).toContain('fechas estimadas');
    expect(card).toContain('accessibilityRole="progressbar"');
    const dash = read('./DashboardScreen.tsx');
    expect(dash).toContain('<CycleCard homeId={homeId} lastBill={data.latest_bill} />');
  });
  it('las anomalías llevan a Consumo con el rango de investigación', () => {
    const section = read('./AnomaliesSection.tsx');
    expect(section).toContain('investigationRange');
    expect(section).toContain('Investigar en Consumo');
    const nav = read('../../navigation/AppNavigator.tsx');
    expect(nav).toContain('initialRangeFromParams(route.params)');
    expect(nav).toContain("tabs.navigate('Consumption', range)");
  });
  it('Consumo usa el selector de rango y permite comparar con el período anterior', () => {
    const screen = read('../consumption/ConsumptionScreen.tsx');
    expect(screen).toContain('<DateRangePicker');
    expect(screen).toContain('<Switch');
    expect(screen).toContain('initialRange');
  });
});

describe('mini-tendencias móviles', () => {
  it('la tarjeta de métrica dibuja el Sparkline solo con tendencia y lo describe a la accesibilidad', () => {
    expect(read('../../components/MetricCard.tsx')).toContain('<Sparkline trend={trend}');
    const spark = read('../../components/Sparkline.tsx');
    expect(spark).toContain('if (!line) return null;');
    expect(spark).toContain('accessibilityLabel={sparklineSummary(');
    const dash = read('./DashboardScreen.tsx');
    expect(dash).toContain("trendValues(series, 'kwh')");
    expect(dash).toContain('trend={amountTrend}');
  });
});
