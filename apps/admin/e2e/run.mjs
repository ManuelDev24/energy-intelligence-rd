// Owns only an exclusive disposable DB and dedicated loopback ports. No reuse mode.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { validateDatabaseUrl, validatePorts } from './safety.mjs';

const adminDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(adminDir, '../..');
const apiDir = path.join(root, 'services/api');
const dbScript = path.join(adminDir, 'e2e/db.py');
const dbUrl = validateDatabaseUrl(process.env.ADMIN_E2E_DATABASE_URL || '');
const [apiPort, adminPort] = validatePorts(
  Number(process.env.ADMIN_E2E_API_PORT || 18317), Number(process.env.ADMIN_E2E_ADMIN_PORT || 3317));
const apiUrl = `http://127.0.0.1:${apiPort}`;
const adminUrl = `http://127.0.0.1:${adminPort}`;
const env = { ...process.env, DATABASE_URL: dbUrl, ENVIRONMENT: 'development', AUTH_ENABLED: 'true',
  AUTH_SIGNING_KEY: randomBytes(48).toString('base64url'), SEED_PILOT: 'false', MIGRATE_ON_START: 'false',
  CORS_ORIGINS: adminUrl, EMAIL_BACKEND: 'console', EMAIL_DEV_OUTBOX: '', SENTRY_DSN: '',
  AUTH_REGISTER_LIMIT: '100', AUTH_LOGIN_LIMIT: '100', AUTH_REFRESH_LIMIT: '100',
  CLIENT_IP_SOURCE: 'socket', BFF_API_SHARED_SECRET: '', RESEND_API_KEY: '', EXPO_ACCESS_TOKEN: '',
  STORAGE_BACKEND: 'disabled', STORAGE_S3_SECRET_ACCESS_KEY: '', STORAGE_S3_ACCESS_KEY_ID: '',
  PASSWORD_RESET_URL: `${adminUrl}/reset`, INVITATION_URL: `${adminUrl}/invite`,
  ADMIN_API_BASE_URL: apiUrl, ADMIN_ORIGIN: adminUrl, NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'development' };
const browserEnv = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR,
  NODE_ENV: 'development', ADMIN_API_BASE_URL: apiUrl, ADMIN_ORIGIN: adminUrl,
  NEXT_TELEMETRY_DISABLED: '1' };
const owned = [];
let databaseCreated = false;
let interrupted = false;
function stop() { interrupted = true; for (const child of owned) { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already stopped */ } } }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

function command(cmd, args, cwd, childEnv = env) {
  if (interrupted) throw new Error('Interrupted');
  // Never inherit stdout/stderr for subprocesses that may print URLs, tokens or PII.
  const result = spawnSync(cmd, args, { cwd, env: childEnv, stdio: 'ignore', timeout: 120_000 });
  if (result.status !== 0) throw new Error(`Isolated ${path.basename(cmd)} step failed (no secrets logged)`);
}
function db(action) { command('uv', ['run', '--frozen', 'python', dbScript, action], apiDir); }
async function portFree(port) {
  const server = createServer();
  try {
    await new Promise((resolve, reject) => server.once('error', reject).listen(port, '127.0.0.1', resolve));
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
  }
}
function start(cmd, args, cwd, childEnv = env) {
  const child = spawn(cmd, args, { cwd, env: childEnv, detached: true, stdio: 'ignore' });
  owned.push(child);
  return child;
}
async function ready(url, child) {
  for (let attempt = 0; attempt < 90; attempt++) {
    if (interrupted || child.exitCode !== null) throw new Error('Isolated server exited before readiness');
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).ok) return; } catch { /* starting */ }
    await delay(1000);
  }
  throw new Error('Isolated server failed readiness');
}
async function register(email, password) {
  const response = await fetch(`${apiUrl}/api/v1/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, accept_terms: true }),
  });
  if (response.status !== 201) throw new Error(`Disposable registration failed (${response.status})`);
  const { access_token: accessToken } = await response.json();
  const me = await fetch(`${apiUrl}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!me.ok) throw new Error(`Disposable account lookup failed (${me.status})`);
  const { id } = await me.json();
  return id;
}
async function playwright(testEnv) {
  const child = spawn(process.execPath, [path.join(root, 'node_modules/@playwright/test/cli.js'),
    'test', '--config', path.join(adminDir, 'playwright.config.ts')],
  { cwd: adminDir, env: testEnv, detached: true, stdio: 'inherit' });
  owned.push(child);
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', code => resolve(code ?? 1));
  });
}

try {
  await portFree(apiPort); await portFree(adminPort);
  db('create'); databaseCreated = true;
  db('migrate');
  db('seed-ocr');
  const api = start('uv', ['run', '--frozen', 'uvicorn', 'app.main:app', '--host', '127.0.0.1',
    '--port', String(apiPort), '--no-proxy-headers'], apiDir);
  await ready(`${apiUrl}/health`, api);
  const suffix = randomBytes(8).toString('hex');
  const adminEmail = `admin-e2e-${suffix}@example.com`;
  const userEmail = `user-e2e-${suffix}@example.com`;
  const adminPassword = randomBytes(32).toString('base64url');
  const userPassword = randomBytes(32).toString('base64url');
  await register(adminEmail, adminPassword);
  const userId = await register(userEmail, userPassword);
  // The only elevation path: trusted CLI, on the account just registered in this DB.
  command('uv', ['run', '--frozen', 'python', '-m', 'app.cli_bootstrap_admin', adminEmail], apiDir);
  const web = start(path.join(root, 'node_modules/.bin/next'),
    ['dev', '-H', '127.0.0.1', '-p', String(adminPort)], adminDir, browserEnv);
  await ready(`${adminUrl}/login`, web);
  // Next dev compiles each route lazily on first hit; pre-warm every route the spec visits
  // so the FIRST real request in a test isn't also paying first-compile latency.
  for (const route of ['/', '/mi-acceso', '/roles', '/auditoria', '/ocr', '/ocr/1', '/resumen', '/usuarios', '/viviendas', '/facturas', '/tarifas', '/operaciones', '/ia', '/viviendas/00000000-0000-4000-8000-000000000000', '/facturas/00000000-0000-4000-8000-000000000000']) {
    await fetch(`${adminUrl}${route}`, { redirect: 'manual' }).catch(() => undefined);
  }
  await fetch(`${adminUrl}/api/admin/session`).catch(() => undefined);
  process.exitCode = await playwright({ ...browserEnv, ADMIN_E2E_OWNED: '1', ADMIN_E2E_ADMIN_PORT: String(adminPort),
    ADMIN_E2E_ADMIN_EMAIL: adminEmail, ADMIN_E2E_ADMIN_PASSWORD: adminPassword,
    ADMIN_E2E_USER_EMAIL: userEmail, ADMIN_E2E_USER_PASSWORD: userPassword, ADMIN_E2E_USER_ID: userId });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Isolated E2E failed');
  process.exitCode = 1;
} finally {
  stop();
  await delay(1500);
  if (databaseCreated) {
    const dropped = spawnSync('uv', ['run', '--frozen', 'python', dbScript, 'drop'],
      { cwd: apiDir, env, stdio: 'ignore', timeout: 120_000 });
    if (dropped.status !== 0) { console.error('Disposable DB cleanup failed; remove it manually with e2e/db.py drop'); process.exitCode = 1; }
  }
}
