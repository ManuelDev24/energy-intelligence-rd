import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

// Run without adding web tooling while ERD-WEB-01/02 are pending.
const source = readFileSync(new URL('./model.ts', import.meta.url), 'utf8');
const model = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`);
const fixtureSource = readFileSync(new URL('./fixtures.ts', import.meta.url), 'utf8');
const { demoConsumption } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(fixtureSource)).toString('base64')}`);

test('filters isolate home, year and provenance without mutating fixtures', () => {
  const original = JSON.stringify(demoConsumption);
  const selected = model.filterConsumption(demoConsumption, { homeId: 'home-1', year: '2026', status: 'REAL' });
  assert.deepEqual(selected.map(row => row.month), ['2026-01', '2026-02']);
  assert.equal(JSON.stringify(demoConsumption), original);
  assert.equal(model.filterConsumption(demoConsumption, { homeId: 'home-1', year: '2025', status: 'ALL' }).length, 0);
});
test('comparison uses the preceding calendar month, including year rollover', () => {
  assert.equal(model.previousMonth('2026-01'), '2025-12');
  const comparison = model.compareMonth(demoConsumption[1], demoConsumption);
  assert.equal(comparison.delta, -12);
  assert.equal(comparison.percent, -5);
  assert.equal(model.compareMonth(demoConsumption[2], [demoConsumption[0]]), null);
});
test('zero baseline yields no percentage and other homes cannot supply baseline', () => {
  const current = { ...demoConsumption[6], month: '2026-03', kWh: 50 };
  assert.equal(model.compareMonth(current, demoConsumption).percent, null);
  assert.equal(model.compareMonth(current, demoConsumption.filter(row => row.homeId === 'home-1')), null);
});
test('demo preserves all four provenance labels and only monthly values', () => {
  assert.deepEqual([...new Set(demoConsumption.map(row => row.status))].sort(), ['ESTIMATED', 'INFERRED', 'PROJECTED', 'REAL']);
  for (const row of demoConsumption) {
    assert.match(row.month, /^\d{4}-\d{2}$/);
    assert.ok(row.kWh >= 0);
    assert.equal('hour' in row, false);
  }
});
