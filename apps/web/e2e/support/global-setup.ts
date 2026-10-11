// ERD-E2E-PLAYWRIGHT: levanta PostgreSQL (base exclusiva), API, worker y web REALES, desde cero y sin intervención manual.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  API_DIR, API_PORT, API_URL, DATABASE_URL, OUTBOX_FILE, PID_FILE, RUN_FILE, TMP_DIR, WEB_DIR, WEB_PORT, WEB_URL,
} from "./env";

const children: ChildProcess[] = [];

function logStream(name: string) {
  return fs.openSync(path.join(TMP_DIR, `${name}.log`), "w");
}

function apiEnv(): NodeJS.ProcessEnv {
  const objects = path.join(TMP_DIR, "objects");
  fs.mkdirSync(objects, { recursive: true });
  const high = "10000"; // todas las personas de prueba salen de la misma IP: se sube el tope anti-abuso (no se desactiva)
  return {
    ...process.env,
    DATABASE_URL, AUTH_ENABLED: "true", ENVIRONMENT: "development",
    AUTH_SIGNING_KEY: crypto.randomBytes(48).toString("base64url"),
    CORS_ORIGINS: WEB_URL, EMAIL_DEV_OUTBOX: OUTBOX_FILE,
    PASSWORD_RESET_URL: `${WEB_URL}/restablecer-contrasena`, INVITATION_URL: `${WEB_URL}/invitacion`,
    STORAGE_BACKEND: "local", STORAGE_LOCAL_DIR: objects,
    STORAGE_ENCRYPTION_KEYS: `k1:${crypto.randomBytes(32).toString("base64url")}`,
    STORAGE_URL_SIGNING_KEY: crypto.randomBytes(48).toString("base64url"),
    AUTH_REGISTER_LIMIT: high, AUTH_LOGIN_LIMIT: high, AUTH_REFRESH_LIMIT: high, AUTH_FORGOT_LIMIT: high, AUTH_RESET_LIMIT: high,
    WORKER_POLL_SECONDS: "0.5", PYTHONUNBUFFERED: "1",
  };
}

function start(name: string, cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): ChildProcess {
  const out = logStream(name);
  const child = spawn(cmd, args, { cwd, env, stdio: ["ignore", out, out], detached: true });
  children.push(child);
  return child;
}

async function waitFor(url: string, what: string, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = String((error as Error).message);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${what} no respondió en ${timeoutMs / 1000}s (${last}). Revisa e2e/.tmp/*.log`);
}

async function alreadyUp(): Promise<boolean> {
  try {
    return (await fetch(`${API_URL}/health`)).ok && fs.existsSync(RUN_FILE);
  } catch {
    return false;
  }
}

export default async function globalSetup() {
  // Solo para desarrollar las pruebas: E2E_REUSE=1 reutiliza el stack que dejó E2E_KEEP=1. Nunca se usa en CI.
  if (process.env.E2E_REUSE && (await alreadyUp())) return;
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const env = apiEnv();

  // 1) Base exclusiva + migraciones desde vacío + fixtures deterministas.
  execFileSync("uv", ["run", "--frozen", "python", "-m", "scripts.e2e_prepare", "--database-url", DATABASE_URL, "--out", RUN_FILE],
    { cwd: API_DIR, env, stdio: "inherit" });

  // 2) API, worker y web reales. Auditoría C-01: el API conecta como `erd_app` y el worker como `erd_worker` (roles restringidos sujetos
  // a la RLS); DB_REQUIRE_RESTRICTED_ROLE hace que el arranque falle si alguno ignorara la RLS. Las URL salen del run.json que dejó e2e_prepare.
  const roles = JSON.parse(fs.readFileSync(RUN_FILE, "utf8")) as { app_database_url: string; worker_database_url: string };
  start("api", "uv", ["run", "--frozen", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(API_PORT), "--no-proxy-headers"],
    API_DIR, { ...env, DATABASE_URL: roles.app_database_url, DB_REQUIRE_RESTRICTED_ROLE: "true" });
  start("worker", "uv", ["run", "--frozen", "python", "-m", "app.worker"], API_DIR,
    { ...env, DATABASE_URL: roles.worker_database_url, DB_REQUIRE_RESTRICTED_ROLE: "true" });
  const webEnv: NodeJS.ProcessEnv = {
    ...process.env, NEXT_PUBLIC_AUTH_ENABLED: "true", API_BASE_URL: API_URL, WEB_ORIGIN: WEB_URL, NEXT_TELEMETRY_DISABLED: "1",
  };
  delete webEnv.NEXT_PUBLIC_SENTRY_DSN; // la telemetría nunca sale de las pruebas
  start("web", path.join(WEB_DIR, "../../node_modules/.bin/next"), ["dev", "-p", String(WEB_PORT)], WEB_DIR, webEnv);
  fs.writeFileSync(PID_FILE, JSON.stringify(children.map((c) => c.pid)));

  await waitFor(`${API_URL}/health`, "La API");
  await waitFor(`${WEB_URL}/login`, "La web");
  // Next compila cada ruta la primera vez que se pide: se precalientan para que ninguna prueba pague ese tiempo.
  for (const route of ["/register", "/olvide-contrasena", "/restablecer-contrasena", "/homes", "/dashboard", "/bills", "/bills/new",
    "/consumption", "/readings", "/goal", "/equipment", "/alerts", "/profile", "/account", "/legal", "/invitacion", "/api/bff/auth/me"]) {
    await fetch(`${WEB_URL}${route}`, { redirect: "manual" }).catch(() => undefined);
  }
}
