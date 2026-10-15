import { describe, expect, it } from 'vitest';

import { billInvalidations, goalInvalidations, phase2Keys, readingInvalidations } from './phase2Keys';

/** Igual que React Query: una clave invalida a otra si es su prefijo. */
const matches = (prefix: readonly unknown[], key: readonly unknown[]) => prefix.every((p, i) => Object.is(p, key[i]));

describe('claves de React Query de Fase 2 (por cuenta y vivienda)', () => {
  const k = phase2Keys(['account', 3]);
  const A = 'home-a';
  const B = 'home-b';

  it('todas cuelgan del alcance de la cuenta (se limpian al cerrar sesión)', () => {
    for (const key of [k.readings(A), k.consumption(A, 'day', '2026-10-01', '2026-10-04'), k.goal(A), k.goalProgress(A)])
      expect(key.slice(0, 2)).toEqual(['account', 3]);
  });

  it('registrar o borrar una lectura invalida lecturas, todo el consumo y el progreso de ESA vivienda', () => {
    const inv = readingInvalidations(k, A);
    const hit = (key: readonly unknown[]) => inv.some((p) => matches(p, key));
    expect(hit(k.readings(A))).toBe(true);
    expect(hit(k.consumption(A, 'day', '2026-09-28', '2026-10-04'))).toBe(true);
    expect(hit(k.consumption(A, 'month', '2025-11-01', '2026-10-04'))).toBe(true);
    expect(hit(k.goalProgress(A))).toBe(true);
    expect(hit(k.goal(A))).toBe(false);
    expect(hit(k.consumption(B, 'day', '2026-09-28', '2026-10-04'))).toBe(false);
    expect(hit(k.goalProgress(B))).toBe(false);
  });

  it('guardar la meta invalida meta y progreso, no el consumo', () => {
    const inv = goalInvalidations(k, A);
    const hit = (key: readonly unknown[]) => inv.some((p) => matches(p, key));
    expect(hit(k.goal(A))).toBe(true);
    expect(hit(k.goalProgress(A))).toBe(true);
    expect(hit(k.consumption(A, 'day', 'a', 'b'))).toBe(false);
  });

  it('las facturas alimentan el progreso de la meta', () => {
    expect(billInvalidations(k, A)).toEqual([k.goalProgress(A)]);
  });

  it('la clave de la meta no es prefijo de la del progreso (invalidaciones independientes)', () => {
    expect(matches(k.goal(A), k.goalProgress(A))).toBe(false);
  });
});
