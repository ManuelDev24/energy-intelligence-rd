// ERD-QA-PERF: presupuesto de JavaScript de primera carga de la web, leído de la salida de `next build`.
// Medido el 2026-10-13: compartido 103 kB; páginas normales 165–181 kB; las que llevan gráficas (recharts) 268–297 kB.
// Los límites dejan ~20 % de margen: atrapan un salto grande (una dependencia nueva, un import de más), no el ruido.
export const BUDGET = { sharedKb: 125, routeKb: 340 };

const UNIT = { B: 1 / 1000, kB: 1, MB: 1000 };
const toKb = (value, unit) => Number(value) * UNIT[unit];

/** Extrae «First Load JS» de la tabla que imprime `next build`: el compartido y el de cada ruta. */
export function parseBuildOutput(text) {
  const shared = /First Load JS shared by all\s+([\d.]+)\s*(B|kB|MB)\b/.exec(text);
  const routes = [];
  for (const line of text.split("\n")) {
    const match = /^[┌├└]\s+\S?\s*(\/\S*)\s+([\d.]+)\s*(?:B|kB|MB)\s+([\d.]+)\s*(B|kB|MB)\s*$/.exec(line.trim());
    if (match) routes.push({ route: match[1], firstLoadKb: toKb(match[3], match[4]) });
  }
  return { sharedKb: shared ? toKb(shared[1], shared[2]) : null, routes };
}

export function evaluate(parsed, budget = BUDGET) {
  const problems = [];
  if (parsed.sharedKb === null) problems.push("No se encontró «First Load JS shared by all» en la salida del build (¿cambió el formato de Next?).");
  if (parsed.routes.length === 0) problems.push("No se encontró ninguna ruta en la salida del build (¿cambió el formato de Next?).");
  if (parsed.sharedKb !== null && parsed.sharedKb > budget.sharedKb) problems.push(`JS compartido: ${parsed.sharedKb} kB supera el presupuesto de ${budget.sharedKb} kB.`);
  for (const r of parsed.routes) if (r.firstLoadKb > budget.routeKb) problems.push(`${r.route}: ${r.firstLoadKb} kB supera el presupuesto de ${budget.routeKb} kB.`);
  return { ok: problems.length === 0, problems };
}
