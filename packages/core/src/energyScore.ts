import type { EnergyScore, ScoreComponent } from '@energyrd/api-contracts';

/**
 * ERD-SCORE-01: presentación del Energy Score. El puntaje, las bandas y los componentes los calcula el backend;
 * aquí solo se traducen a texto y se comparte la misma regla de banda entre las dos gauges (web y móvil).
 * Estos umbrales deben coincidir con `BANDS` del motor de la API (hay una prueba que lo exige).
 */
export const SCORE_BANDS = [
  { key: 'good', word: 'Bueno', min: 70 },
  { key: 'fair', word: 'Regular', min: 40 },
  { key: 'poor', word: 'Mejorable', min: 0 },
] as const;
export type ScoreBandKey = (typeof SCORE_BANDS)[number]['key'];

export function scoreBand(value: number): { key: ScoreBandKey; word: string } {
  const v = Math.round(Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0)));
  const band = SCORE_BANDS.find((b) => v >= b.min) ?? SCORE_BANDS[SCORE_BANDS.length - 1];
  return { key: band.key, word: band.word };
}

export interface ScoreComponentView {
  key: ScoreComponent['key'];
  label: string;
  /** «72» o «Sin datos». */
  scoreText: string;
  score: number | null;
  weightText: string;
  summary: string;
  detail: string;
  /** Qué falta, si no hay dato; qué hacer, si lo hay. */
  hint: string;
}

export function scoreComponentView(c: ScoreComponent): ScoreComponentView {
  return {
    key: c.key, label: c.label, score: c.score, scoreText: c.score === null ? 'Sin datos' : String(c.score), weightText: `${c.weight}%`,
    summary: c.summary, detail: c.detail, hint: c.score === null ? (c.reasons[0] ?? c.next_step) : c.next_step,
  };
}

/** «Calculado con el 60 % de los datos»: transparencia cuando faltan componentes. null si están todos. */
export function scoreCoverageNote(score: Pick<EnergyScore, 'coverage_pct'>): string | null {
  return score.coverage_pct >= 100 ? null : `Calculado con ${score.coverage_pct}% de los datos posibles: los componentes sin datos no se rellenan.`;
}
