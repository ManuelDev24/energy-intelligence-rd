// ERD-E2E-MAESTRO-AUTH (parte estática): los flujos de Maestro se pueden validar sin dispositivo en dos cosas:
// que el YAML sea sintácticamente válido y que cada `id:` que tocan EXISTA como testID en el código de la app.
// No prueba que el flujo pase: eso requiere simulador/emulador (ver docs/qa/ERD-E2E-MAESTRO-AUTH.md).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseAllDocuments } from 'yaml';
import { describe, expect, it } from 'vitest';

const SRC = new URL('.', import.meta.url).pathname;
const MAESTRO = new URL('../maestro/', import.meta.url).pathname;
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) && !/\.test\./.test(p) ? [p] : [];
  });
const code = walk(SRC).map((p) => readFileSync(p, 'utf8')).join('\n');

/** testID literales y plantillas (`account-onboarding-${key}` → patrón). Los `${prefix}-x` internos también cuentan. */
const literal = new Set([...code.matchAll(/testID(?:=|: )["'`]([^"'`$]+)["'`]/g)].map((m) => m[1]));
// Una plantilla sin parte literal (`${testID}`) aceptaría cualquier id: se descarta.
const templates = [...code.matchAll(/testID(?:=\{|: )`([^`]+)`/g)].map((m) => m[1]).filter((t) => t.replace(/\$\{[^}]*\}/g, '').replace(/-/g, '').length >= 3);
const templateRegexes = templates.map(
  (t) => new RegExp('^' + t.split(/\$\{[^}]*\}/).map((s) => s.replace(/[.*+?^$()|[\]\\]/g, '\\$&')).join('.+') + '$'),
);
// Componentes que derivan el testID de otro (`${testID}-error` de <Field>, `${testIDPrefix}-${key}`, `range-…`).
const derived = [/^range-(7d|30d|12m|custom)$/, /^tab-(Dashboard|Consumption|Bills|Equipment|Alerts)$/];
// <Field testID="x"> publica además `x-error`: vale si `x` existe.
const exists = (id: string): boolean =>
  (/-error$/.test(id) && !literal.has(id) && exists(id.replace(/-error$/, '')) && /components\/Field|Field /.test(code)) ||
  literal.has(id) || templateRegexes.some((r) => r.test(id)) || derived.some((r) => r.test(id));

function flowIds(file: string) {
  const text = readFileSync(join(MAESTRO, file), 'utf8');
  const docs = parseAllDocuments(text);
  expect(docs.flatMap((d) => d.errors.map(String)), `${file}: YAML inválido`).toEqual([]);
  const ids: string[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) node.forEach(visit);
    else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) {
        if (k === 'id' && typeof v === 'string') ids.push(v);
        else visit(v);
      }
    }
  };
  docs.forEach((d) => visit(d.toJS()));
  return { ids, text };
}

describe('flujos de Maestro de cuentas', () => {
  it('auth-flow.yaml: YAML válido y todos los id: existen como testID en la app', () => {
    const { ids } = flowIds('auth-flow.yaml');
    expect(ids.length).toBeGreaterThan(30);
    const missing = [...new Set(ids)].filter((id) => !exists(id));
    expect(missing, 'testID inexistentes en la app').toEqual([]);
  });

  it('el comprobador detecta un id inventado', () => {
    expect(exists('auth-submit')).toBe(true);
    expect(exists('account-onboarding-name')).toBe(true);
    expect(exists('boton-que-no-existe')).toBe(false);
  });

  it('el flujo no toca OCR y declara honestamente que no se ha ejecutado', () => {
    const { text } = flowIds('auth-flow.yaml');
    expect(text.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n')).not.toMatch(/ocr|BillOcr|bill-ocr/i);
    expect(text).toContain('NO EJECUTADO');
  });

  it('run-auth.sh genera un correo único por corrida y no lleva secretos', () => {
    const sh = readFileSync(join(MAESTRO, 'run-auth.sh'), 'utf8');
    expect(sh).toContain('date +%s');
    expect(sh).toContain('example.com');
    expect(sh).not.toMatch(/(api[_-]?key|secret|token)\s*=/i);
  });

  it('el flujo cubre registro, onboarding, perfil, consumo, meta, cierre/ingreso y recuperación', () => {
    const { ids } = flowIds('auth-flow.yaml');
    for (const id of ['auth-submit', 'account-onboarding-next', 'profile-home', 'consumption-screen', 'goal-card', 'auth-logout', 'auth-forgot-confirmation'])
      expect(ids).toContain(id);
  });
});
