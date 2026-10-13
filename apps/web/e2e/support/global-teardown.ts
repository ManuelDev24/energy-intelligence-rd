// ERD-E2E-PLAYWRIGHT: apaga lo que se levantó y BORRA la base exclusiva. Los datos de prueba no sobreviven a la corrida.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { API_DIR, DATABASE_URL, PID_FILE } from "./env";

export default async function globalTeardown() {
  if (process.env.E2E_KEEP || process.env.E2E_REUSE) return; // desarrollo de pruebas: se deja el stack arriba
  try {
    for (const pid of JSON.parse(fs.readFileSync(PID_FILE, "utf8")) as number[]) {
      try {
        process.kill(-pid, "SIGTERM"); // el grupo entero: `uv`/`next` lanzan procesos hijos
      } catch {
        /* ya terminó */
      }
    }
  } catch {
    /* no hubo arranque */
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  try {
    execFileSync("uv", ["run", "--frozen", "python", "-m", "scripts.e2e_prepare", "--database-url", DATABASE_URL, "--drop"], { cwd: API_DIR, stdio: "inherit" });
  } catch (error) {
    console.warn("No se pudo borrar la base E2E:", (error as Error).message);
  }
}
