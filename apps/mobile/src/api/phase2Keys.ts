// Claves de React Query de Fase 2 (lecturas, consumo, meta y progreso). Puro: recibe el alcance de
// la cuenta (`['account', epoch]` o `['pilot']`), así el `queryClient.clear()` del cierre de sesión
// y el cambio de época dejan atrás todo lo de la cuenta anterior.
import type { Granularity } from '@energyrd/api-contracts';

export function phase2Keys(scope: readonly unknown[]) {
  return {
    readings: (homeId: string) => [...scope, 'readings', homeId] as const,
    /** Prefijo de todo el consumo de una vivienda (cualquier granularidad y rango). */
    consumptionAll: (homeId: string) => [...scope, 'consumption', homeId] as const,
    consumption: (homeId: string, g: Granularity, from: string, to: string) => [...scope, 'consumption', homeId, g, from, to] as const,
    goal: (homeId: string) => [...scope, 'goal', homeId] as const,
    goalProgress: (homeId: string) => [...scope, 'goal-progress', homeId] as const,
  };
}
export type Phase2Keys = ReturnType<typeof phase2Keys>;

/** Una lectura cambia la serie, todo el consumo de la vivienda y el progreso del mes. */
export const readingInvalidations = (k: Phase2Keys, homeId: string): (readonly unknown[])[] =>
  [k.readings(homeId), k.consumptionAll(homeId), k.goalProgress(homeId)];
/** Guardar la meta cambia la meta y su progreso; el consumo no. */
export const goalInvalidations = (k: Phase2Keys, homeId: string): (readonly unknown[])[] => [k.goal(homeId), k.goalProgress(homeId)];
/** Las facturas alimentan el progreso (prorrateo, precio medio, proyección lineal). */
export const billInvalidations = (k: Phase2Keys, homeId: string): (readonly unknown[])[] => [k.goalProgress(homeId)];
