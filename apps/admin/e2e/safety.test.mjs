import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDatabaseUrl, validatePorts } from './safety.mjs';

const good = 'postgresql+psycopg://energy:synthetic@127.0.0.1:5433/energy_rd_admin_e2e_test';
test('only the exact disposable localhost PostgreSQL database is accepted', () => {
  assert.equal(validateDatabaseUrl(good), good);
  for (const url of [
    good.replace('energy_rd_admin_e2e_test', 'energy_rd'),
    good.replace('energy_rd_admin_e2e_test', 'energy_rd_e2e'),
    good.replace('127.0.0.1', 'prod.example.com'),
    good.replace('postgresql+psycopg', 'sqlite'),
    `${good}?options=-csearch_path%3Dpublic`,
  ]) assert.throws(() => validateDatabaseUrl(url), /disposable local database/);
});
test('API and admin ports must be separate from pilot and each other', () => {
  assert.deepEqual(validatePorts(18317, 3317), [18317, 3317]);
  for (const pair of [[8000, 3317], [18317, 3100], [18317, 18317], [0, 3317]])
    assert.throws(() => validatePorts(...pair), /reserved or invalid port/);
});
