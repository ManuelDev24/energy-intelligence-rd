import assert from "node:assert/strict";
import test from "node:test";
import { BUDGET, evaluate, parseBuildOutput } from "./bundle-budget-lib.mjs";

// Fragmento real de `next build` (2026-10-13).
const SAMPLE = `Route (app)                                 Size  First Load JS
┌ ƒ /                                      160 B         103 kB
├ ƒ /_not-found                            995 B         104 kB
├ ƒ /account                             6.45 kB         166 kB
├ ○ /apple-icon.png                          0 B            0 B
├ ƒ /bills                               12.3 kB         268 kB
├ ƒ /consumption                         10.3 kB         297 kB
└ ƒ /verificar-correo                    2.04 kB         178 kB
+ First Load JS shared by all            103 kB
  ├ chunks/18-bb7d85faaf08e91b.js        46.9 kB
`;

test("extrae el JS compartido y el de cada ruta (incluidas las que miden 0 B)", () => {
  const parsed = parseBuildOutput(SAMPLE);
  assert.equal(parsed.sharedKb, 103);
  assert.deepEqual(parsed.routes.map((r) => r.route), ["/", "/_not-found", "/account", "/apple-icon.png", "/bills", "/consumption", "/verificar-correo"]);
  assert.equal(parsed.routes.find((r) => r.route === "/consumption").firstLoadKb, 297);
  assert.equal(parsed.routes.find((r) => r.route === "/apple-icon.png").firstLoadKb, 0);
});

test("la medición actual cabe en el presupuesto", () => {
  assert.equal(evaluate(parseBuildOutput(SAMPLE)).ok, true);
});

test("una ruta que engorda por encima del presupuesto falla y dice cuál", () => {
  const fat = SAMPLE.replace("297 kB", "412 kB");
  const result = evaluate(parseBuildOutput(fat));
  assert.equal(result.ok, false);
  assert.match(result.problems[0], /\/consumption: 412 kB supera el presupuesto de 340 kB/);
});

test("el JS compartido por encima del presupuesto falla", () => {
  const result = evaluate(parseBuildOutput(SAMPLE.replace("shared by all            103 kB", "shared by all            140 kB")));
  assert.equal(result.ok, false);
  assert.match(result.problems[0], new RegExp(`JS compartido: 140 kB supera el presupuesto de ${BUDGET.sharedKb} kB`));
});

test("una salida que no se puede interpretar falla en lugar de aprobar en silencio", () => {
  const result = evaluate(parseBuildOutput("Compiled successfully"));
  assert.equal(result.ok, false);
  assert.equal(result.problems.length, 2);
});
