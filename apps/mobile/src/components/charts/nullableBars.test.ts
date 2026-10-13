import { describe, expect, it } from 'vitest';

import { axisLabelIndices, layoutNullableBars } from './chartMath';

describe('layoutNullableBars (consumo por lecturas, huecos visibles)', () => {
  const H = 140; // topPad 18 + plot 102 + bottomPad 20
  it('null es un hueco de altura completa marcado como gap, nunca una barra de 0', () => {
    const bars = layoutNullableBars([10, null, 5], 300, H);
    expect(bars.map((b) => b.gap)).toEqual([false, true, false]);
    expect(bars[1]).toMatchObject({ y: 18, height: 102 });
    expect(bars[0].height).toBe(102); // el máximo ocupa toda el área
    expect(bars[2].height).toBe(51);
  });

  it('un 0 real es una barra de altura 0 (no hueco)', () => {
    const bars = layoutNullableBars([0, 4], 200, H);
    expect(bars[0]).toMatchObject({ gap: false, height: 0, y: 120 });
  });

  it('serie solo de huecos: todos gap, ninguno con valor', () => {
    expect(layoutNullableBars([null, null], 200, H).every((b) => b.gap)).toBe(true);
  });

  it('muchas barras: ancho mínimo de 1 px para que se vean', () => {
    const bars = layoutNullableBars(Array.from({ length: 365 }, () => 1), 300, H);
    expect(bars).toHaveLength(365);
    expect(Math.min(...bars.map((b) => b.width))).toBeGreaterThanOrEqual(0.5);
  });

  it('sin datos o sin ancho no dibuja nada', () => {
    expect(layoutNullableBars([], 300, H)).toEqual([]);
    expect(layoutNullableBars([1], 0, H)).toEqual([]);
  });
});

describe('axisLabelIndices', () => {
  it('todas las etiquetas si caben', () => expect(axisLabelIndices(7, 350)).toEqual([0, 1, 2, 3, 4, 5, 6]));
  it('salta etiquetas para que no se solapen, conservando la primera', () => {
    const idx = axisLabelIndices(30, 300, 40);
    expect(idx[0]).toBe(0);
    expect(idx.length).toBeLessThanOrEqual(7);
    expect(idx[1] - idx[0]).toBe(idx[2] - idx[1]);
  });
  it('vacío sin barras o sin ancho', () => {
    expect(axisLabelIndices(0, 300)).toEqual([]);
    expect(axisLabelIndices(5, 0)).toEqual([]);
  });
});
