import assert from "node:assert/strict";
import test from "node:test";
import { collectAdvisories, evaluate } from "./audit-monitor-lib.mjs";

const advisory = (name, ghsa, severity = "high", range = "<=1.0.0") => ({ source: 1, name, url: `https://github.com/advisories/${ghsa}`, severity, range });
const audit = (...via) => ({ vulnerabilities: { a: { via: [...via, "b"] }, b: { via: [via[0]] } } });
const accepted = (...entries) => ({ accepted: entries });
const entry = (ghsa, review_by = "2026-11-04") => ({ ghsa, package: "x", review_by });
const TODAY = "2026-10-10";

test("cuenta avisos únicos, no paquetes transitivos", () => {
  assert.deepEqual(collectAdvisories(audit(advisory("braces", "GHSA-aaaa-1111"))).map((a) => a.id), ["GHSA-AAAA-1111"]);
});

test("aviso alto aceptado y vigente aprueba y queda anotado", () => {
  const result = evaluate({ audit: audit(advisory("braces", "GHSA-aaaa-1111")), accepted: accepted(entry("GHSA-AAAA-1111")), today: TODAY });
  assert.equal(result.ok, true);
  assert.match(result.notes[0], /sin parche publicado/);
});

test("aviso alto sin aceptación falla", () => {
  const result = evaluate({ audit: audit(advisory("lodash", "GHSA-bbbb-2222")), accepted: accepted(), today: TODAY });
  assert.equal(result.ok, false);
  assert.match(result.problems[0], /SIN ACEPTAR: GHSA-BBBB-2222/);
});

test("críticos también bloquean; moderados y bajos no", () => {
  assert.equal(evaluate({ audit: audit(advisory("p", "GHSA-cccc-3333", "critical")), accepted: accepted(), today: TODAY }).ok, false);
  assert.equal(evaluate({ audit: audit(advisory("p", "GHSA-cccc-3333", "moderate")), accepted: accepted(), today: TODAY }).ok, true);
  assert.equal(evaluate({ audit: audit(advisory("p", "GHSA-cccc-3333", "low")), accepted: accepted(), today: TODAY }).ok, true);
});

test("aceptación vencida falla el día siguiente a la fecha de revisión, no antes", () => {
  const args = { audit: audit(advisory("braces", "GHSA-aaaa-1111")), accepted: accepted(entry("GHSA-AAAA-1111", "2026-11-04")) };
  assert.equal(evaluate({ ...args, today: "2026-11-04" }).ok, true);
  const late = evaluate({ ...args, today: "2026-11-05" });
  assert.equal(late.ok, false);
  assert.match(late.problems[0], /ACEPTACIÓN VENCIDA/);
});

test("parche publicado obliga a actualizar", () => {
  const result = evaluate({
    audit: audit(advisory("node-forge", "GHSA-dddd-4444", "high", "<=1.4.0")),
    accepted: accepted(entry("GHSA-DDDD-4444")),
    patched: { "GHSA-DDDD-4444": ["1.4.1"] },
    today: TODAY,
  });
  assert.equal(result.ok, false);
  assert.match(result.problems[0], /PARCHE DISPONIBLE: node-forge 1.4.1/);
});

test("aceptación de un aviso que ya no existe se marca obsoleta", () => {
  const result = evaluate({ audit: { vulnerabilities: {} }, accepted: accepted(entry("GHSA-EEEE-5555")), today: TODAY });
  assert.equal(result.ok, false);
  assert.match(result.problems[0], /ACEPTACIÓN OBSOLETA/);
});

test("la respuesta del registro se interpreta sin confundir errores con parches", async () => {
  const { parseRegistryVersions } = await import("./audit-monitor-lib.mjs");
  assert.deepEqual(parseRegistryVersions(""), []);
  assert.deepEqual(parseRegistryVersions('"1.4.1"'), ["1.4.1"]);
  assert.deepEqual(parseRegistryVersions('["1.4.1","1.5.0"]'), ["1.4.1", "1.5.0"]);
  assert.deepEqual(parseRegistryVersions('{"error":{"code":"E404","summary":"No match"}}'), []);
  assert.throws(() => parseRegistryVersions('{"error":{"code":"EAI_AGAIN"}}'), /inesperada/);
});
