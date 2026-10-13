// Uso: node scripts/bundle-budget.mjs <salida-de-next-build.log>
import { readFileSync } from "node:fs";
import { BUDGET, evaluate, parseBuildOutput } from "./bundle-budget-lib.mjs";

const file = process.argv[2];
if (!file) { console.error("Uso: node scripts/bundle-budget.mjs <salida-de-next-build.log>"); process.exit(2); }
const parsed = parseBuildOutput(readFileSync(file, "utf8"));
const result = evaluate(parsed);
const top = [...parsed.routes].sort((a, b) => b.firstLoadKb - a.firstLoadKb).slice(0, 5);
console.log(`JS compartido: ${parsed.sharedKb} kB (presupuesto ${BUDGET.sharedKb} kB)`);
console.log(`Rutas medidas: ${parsed.routes.length}. Las más pesadas (presupuesto ${BUDGET.routeKb} kB):`);
for (const r of top) console.log(`  ${r.route.padEnd(24)} ${r.firstLoadKb} kB`);
if (!result.ok) { console.error(`\nPRESUPUESTO SUPERADO:\n- ${result.problems.join("\n- ")}`); process.exit(1); }
console.log("RESULTADO: OK");
