// ERD-E2E-PLAYWRIGHT: la web se prueba contra PostgreSQL, API y worker reales (ver e2e/support/global-setup.ts).
import { defineConfig, devices } from "@playwright/test";
import { WEB_URL } from "./e2e/support/env";

const ci = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e/specs",
  outputDir: "./e2e/.results",
  globalSetup: "./e2e/support/global-setup.ts",
  globalTeardown: "./e2e/support/global-teardown.ts",
  fullyParallel: false,
  workers: 1,               // una sola base compartida: sin carreras entre pruebas
  forbidOnly: true,         // un `.only` olvidado hace fallar la corrida en vez de omitir el resto
  retries: ci ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: ci ? [["list"], ["html", { open: "never", outputFolder: "./e2e/.report" }]] : [["list"]],
  use: {
    baseURL: WEB_URL,
    locale: "es-DO",
    timezoneId: "America/Santo_Domingo",
    // Evidencia solo cuando algo falla. Los datos son sintéticos y la base se borra; aun así `scripts/scrub_artifacts.py`
    // quita tokens, cookies, contraseñas y correos de las trazas antes de publicarlas.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    launchOptions: process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH, args: ["--no-sandbox"] } : { args: ["--no-sandbox"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
