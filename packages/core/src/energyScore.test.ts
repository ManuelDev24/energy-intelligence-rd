import { describe, expect, it } from 'vitest';
import type { EnergyScore } from '@energyrd/api-contracts';
import { scoreBand, scoreComponentView, scoreCoverageNote } from './energyScore';

const component = (over: Partial<EnergyScore['components'][number]> = {}): EnergyScore['components'][number] => ({
  key: 'consumption', label: 'Consumo', weight: 35, score: 72, available: true, summary: 'Qué mide', detail: 'Cuánto y por qué', inputs: {},
  reasons: [], next_step: 'Define una meta', ...over,
});

describe('Energy Score (ERD-SCORE-01)', () => {
  it('las bandas coinciden con las del backend: 70 / 40', () => {
    expect([100, 70, 69, 40, 39, 0].map((v) => scoreBand(v).word)).toEqual(['Bueno', 'Bueno', 'Regular', 'Regular', 'Mejorable', 'Mejorable']);
    expect(scoreBand(140).key).toBe('good');
    expect(scoreBand(Number.NaN).key).toBe('poor');
    expect(scoreBand(69.6).word).toBe('Bueno');   // se redondea antes de decidir la banda, como el puntaje que se muestra
  });

  it('un componente sin datos dice «Sin datos» y explica qué falta; con datos propone el siguiente paso', () => {
    expect(scoreComponentView(component())).toMatchObject({ scoreText: '72', weightText: '35%', hint: 'Define una meta' });
    const none = scoreComponentView(component({ score: null, available: false, reasons: ['Declara al menos un equipo.'] }));
    expect(none).toMatchObject({ scoreText: 'Sin datos', score: null, hint: 'Declara al menos un equipo.' });
    expect(scoreComponentView(component({ score: null, available: false, reasons: [] })).hint).toBe('Define una meta');
  });

  it('avisa cuando el puntaje se calculó con parte de los datos', () => {
    expect(scoreCoverageNote({ coverage_pct: 100 })).toBeNull();
    expect(scoreCoverageNote({ coverage_pct: 60 })).toContain('60%');
  });
});
