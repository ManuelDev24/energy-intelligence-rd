import { defineConfig, devices } from '@playwright/test';

// Run only through `node e2e/run.mjs`: it owns the disposable DB and both servers.
if (process.env.ADMIN_E2E_OWNED !== '1') throw new Error('Use node e2e/run.mjs (disposable stack required)');
export default defineConfig({
  testDir: './e2e',
  testMatch: '*.spec.ts',
  outputDir: './e2e/.results',
  preserveOutput: 'failures-only',
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: [['dot']],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${process.env.ADMIN_E2E_ADMIN_PORT || '3317'}`,
    trace: 'off', screenshot: 'off', video: 'off',
    locale: 'es-DO',
    launchOptions: { args: ['--no-sandbox'] },
  },
});
