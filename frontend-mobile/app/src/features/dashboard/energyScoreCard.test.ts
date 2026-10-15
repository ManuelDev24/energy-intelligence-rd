// ERD-SCORE-01 (móvil): filas del Energy Score + estructura (no hay render de React Native en vitest).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { EnergyScore } from '../../api/types';
import { scoreRows } from './scoreRows';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const component = (key: EnergyScore['components'][number]['key'], label: string, weight: number, score: number | null): EnergyScore['components'][number] => ({
  key, label, weight, score, available: score !== null, summary: 's', detail: `Detalle ${label}`, inputs: {},
  reasons: score === null ? [`Falta algo para ${label}`] : [], next_step: `Paso ${label}`,
});
const score = (over: Partial<EnergyScore> = {}): EnergyScore => ({
  home_id: '00000000-0000-0000-0000-000000000001', score_version: 1, as_of: '2026-10-11', status: 'ok', score: 72, band: 'good', band_label: 'Bueno',
  quality: 'INFERRED', coverage_pct: 60, reasons: [], method: 'm', note: 'n',
  components: [component('consumption', 'Consumo', 35, 80), component('efficiency', 'Eficiencia', 25, null)], ...over,
});

describe('EnergyScoreCard (móvil)', () => {
  it('cada fila muestra el puntaje o «Sin datos» con lo que falta, y su etiqueta accesible', () => {
    const [consumo, eficiencia] = scoreRows(score());
    expect(consumo).toMatchObject({ label: 'Consumo (35%)', value: '80', fraction: 0.8, text: 'Detalle Consumo', accessibilityLabel: 'Consumo: 80 de 100. Detalle Consumo' });
    expect(eficiencia).toMatchObject({ value: 'Sin datos', fraction: null, text: 'Falta algo para Eficiencia', accessibilityLabel: 'Eficiencia: sin datos. Falta algo para Eficiencia' });
  });

  it('sin puntaje no hay gauge; con puntaje se etiqueta INFERIDO; si falla la consulta no rompe el panel', () => {
    const card = read('./EnergyScoreCard.tsx');
    expect(card).toContain("if (isLoading || isError || !data) return null;");
    expect(card).toContain('data.score === null ?');
    expect(card).toContain('quality="INFERRED"');
    expect(card).toContain('scoreCoverageNote(data)');
  });

  it('el panel lo muestra y el gauge usa las bandas compartidas con el backend', () => {
    expect(read('./DashboardScreen.tsx')).toContain('scoreSlot={<EnergyScoreCard homeId={homeId} />}');
    const gauge = read('../../components/charts/EnergyGauge.tsx');
    expect(gauge).toContain("scoreBand(value)");
    expect(gauge).not.toContain('value >= 70');
  });
});
