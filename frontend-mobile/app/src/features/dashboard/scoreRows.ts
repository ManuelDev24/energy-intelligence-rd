import { scoreComponentView } from '@energyrd/core';

import type { EnergyScore } from '../../api/types';

/** Lógica pura de la tarjeta: qué texto y qué etiqueta accesible lleva cada componente. */
export function scoreRows(score: EnergyScore) {
  return score.components.map((c) => {
    const v = scoreComponentView(c);
    return {
      key: v.key, label: `${v.label} (${v.weightText})`, value: v.scoreText, fraction: v.score === null ? null : v.score / 100,
      text: v.score === null ? v.hint : v.detail,
      accessibilityLabel: v.score === null ? `${v.label}: sin datos. ${v.hint}` : `${v.label}: ${v.score} de 100. ${v.detail}`,
    };
  });
}
