import { describe, expect, it } from 'vitest';

import { deltaDisplay, equipmentShares, gaugeArcPath, gaugePoint, layoutBars, scoreFraction, slotWidth } from './chartMath';

describe('layoutBars (CH-01)', () => {
  it('escala las alturas al máximo y comparte la línea base', () => {
    const bars = layoutBars([{ value: 100 }, { value: 50 }, { value: 200 }], 300, 160, { topPad: 20, bottomPad: 20 });
    expect(bars).toHaveLength(3);
    // área de dibujo = 160 - 20 - 20 = 120; base en y = 140
    expect(bars[2].height).toBe(120);
    expect(bars[0].height).toBe(60);
    expect(bars[1].height).toBe(30);
    for (const b of bars) expect(b.y + b.height).toBe(140);
  });

  it('centra cada barra en su columna y respeta el ancho máximo', () => {
    const bars = layoutBars([{ value: 1 }, { value: 1 }], 400, 100, { maxBarWidth: 40 });
    expect(bars[0].cx).toBe(100);
    expect(bars[1].cx).toBe(300);
    expect(bars[0].width).toBe(40);
    expect(bars[0].x).toBe(80);
  });

  it('no inventa altura para valores 0, negativos o no finitos', () => {
    const bars = layoutBars([{ value: 0 }, { value: -5 }, { value: Number.NaN }, { value: 10 }], 200, 100);
    expect(bars.slice(0, 3).map((b) => b.height)).toEqual([0, 0, 0]);
    expect(bars[3].height).toBeGreaterThan(0);
  });

  it('da una altura mínima visible a valores pequeños', () => {
    const bars = layoutBars([{ value: 1000 }, { value: 0.1 }], 200, 100, { minBarHeight: 2 });
    expect(bars[1].height).toBe(2);
  });

  it('devuelve [] sin datos o sin ancho medido', () => {
    expect(layoutBars([], 300, 100)).toEqual([]);
    expect(layoutBars([{ value: 1 }], 0, 100)).toEqual([]);
  });

  it('slotWidth reparte el ancho', () => {
    expect(slotWidth(4, 320)).toBe(80);
    expect(slotWidth(0, 320)).toBe(0);
  });
});

describe('equipmentShares (CH-10)', () => {
  const items = [
    { key: 'a', label: 'Aire', value: 41 },
    { key: 'n', label: 'Nevera', value: 17 },
    { key: 'b', label: 'Bomba', value: 11 },
    { key: 'o', label: 'Boiler', value: 9 },
    { key: 'c', label: 'Cocina', value: 8 },
    { key: 'x', label: 'Abanico', value: 7 },
    { key: 'y', label: 'TV', value: 7 },
  ];

  it('ordena de mayor a menor y agrupa el resto en "Otros"', () => {
    const s = equipmentShares(items, 6);
    expect(s.map((r) => r.label)).toEqual(['Aire', 'Nevera', 'Bomba', 'Boiler', 'Cocina', 'Otros (2)']);
    expect(s[5].value).toBe(14);
    expect(s[0].pct).toBe(41);
    expect(s[0].ratio).toBe(1);
    expect(s.reduce((a, r) => a + r.pct, 0)).toBeCloseTo(100, 5);
  });

  it('sin agrupar si cabe y descarta equipos con 0 kWh', () => {
    const s = equipmentShares([{ key: 'a', label: 'A', value: 3 }, { key: 'b', label: 'B', value: 1 }, { key: 'z', label: 'Z', value: 0 }]);
    expect(s.map((r) => [r.label, r.pct])).toEqual([['A', 75], ['B', 25]]);
  });

  it('total 0 → [] (no se dibuja un gráfico vacío)', () => {
    expect(equipmentShares([{ key: 'a', label: 'A', value: 0 }])).toEqual([]);
    expect(equipmentShares([])).toEqual([]);
  });
});

describe('deltaDisplay (MetricCard)', () => {
  it('subir consumo es desfavorable, bajar es favorable', () => {
    expect(deltaDisplay('12.5')).toEqual({ direction: 'up', arrow: '▲', tone: 'bad' });
    expect(deltaDisplay(-3)).toEqual({ direction: 'down', arrow: '▼', tone: 'good' });
    expect(deltaDisplay(0)).toEqual({ direction: 'flat', arrow: '=', tone: 'neutral' });
  });

  it('respeta goodWhen="up" y devuelve null sin dato', () => {
    expect(deltaDisplay(5, 'up')?.tone).toBe('good');
    expect(deltaDisplay(null)).toBeNull();
    expect(deltaDisplay('abc')).toBeNull();
  });
});

describe('gauge (CH-09)', () => {
  it('los extremos del semicírculo', () => {
    expect(gaugePoint(100, 100, 80, 0)).toEqual({ x: 20, y: 100 });
    expect(gaugePoint(100, 100, 80, 1)).toEqual({ x: 180, y: 100 });
    expect(gaugePoint(100, 100, 80, 0.5)).toEqual({ x: 100, y: 20 });
  });

  it('traza el arco desde la izquierda hasta la fracción', () => {
    expect(gaugeArcPath(100, 100, 80, 0.5)).toBe('M 20 100 A 80 80 0 0 1 100 20');
    expect(gaugeArcPath(100, 100, 80, 1)).toBe('M 20 100 A 80 80 0 0 1 180 100');
    expect(gaugeArcPath(100, 100, 80, 0)).toBe('');
    expect(gaugeArcPath(100, 100, 80, 2)).toBe(gaugeArcPath(100, 100, 80, 1));
  });

  it('scoreFraction acota y rechaza no finitos', () => {
    expect(scoreFraction(72)).toBe(0.72);
    expect(scoreFraction(150)).toBe(1);
    expect(scoreFraction(-1)).toBe(0);
    expect(scoreFraction(null)).toBeNull();
    expect(scoreFraction(Number.NaN)).toBeNull();
  });
});
