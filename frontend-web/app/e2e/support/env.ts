// ERD-E2E-PLAYWRIGHT: puertos, rutas y base exclusivas de las pruebas E2E. Nada de esto toca la base ni los puertos del piloto.
import path from "node:path";

export const API_PORT = Number(process.env.E2E_API_PORT ?? 18101);
export const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3101);
export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? "postgresql+psycopg://energy:change_me_local_only@localhost:5432/energy_rd_e2e";
export const REPO_ROOT = path.resolve(__dirname, "../../../..");
export const API_DIR = path.join(REPO_ROOT, "backend/api");
export const WEB_DIR = path.join(REPO_ROOT, "frontend-web/app");
export const TMP_DIR = path.join(WEB_DIR, "e2e/.tmp");
export const RUN_FILE = path.join(TMP_DIR, "run.json");
export const OUTBOX_FILE = path.join(TMP_DIR, "outbox.jsonl");
export const PID_FILE = path.join(TMP_DIR, "pids.json");

/** Datos que `scripts.e2e_prepare` deja para las pruebas (persona de pruebas, viviendas piloto, factura sintética). */
export interface RunData {
  pilot_email: string;
  pilot_password: string;
  pilot_homes: Record<string, string>;
  bill_image: string;
  bill_expected: Record<string, string>;
}
