#!/usr/bin/env node
// ERD-SEC-DEPS-MONITOR: npm audit contra docs/security/accepted-advisories.json y consulta de parches al registro.
// Uso: node scripts/audit-monitor.mjs [--offline]   (sale con 1 si hay problemas). Nunca ejecuta `npm audit fix`.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { evaluate, parseRegistryVersions } from "./audit-monitor-lib.mjs";

const offline = process.argv.includes("--offline");
const accepted = JSON.parse(readFileSync(new URL("../docs/security/accepted-advisories.json", import.meta.url), "utf8"));

function run(args) {
  try {
    return execFileSync("npm", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
  } catch (error) {
    if (error.stdout) return error.stdout; // npm audit sale con 1 cuando hay avisos
    throw error;
  }
}

const audit = JSON.parse(run(["audit", "--json"]));
if (audit.error) {
  console.error(`npm audit falló: ${audit.error.summary ?? audit.error.code}`);
  process.exit(2);
}

const patched = {};
if (!offline) {
  for (const entry of accepted.accepted) {
    patched[entry.ghsa.toUpperCase()] = parseRegistryVersions(run(["view", `${entry.package}@${entry.patched_query}`, "version", "--json"]));
  }
}

const today = new Date().toISOString().slice(0, 10);
const result = evaluate({ audit, accepted, patched, today });
const counts = audit.metadata?.vulnerabilities ?? {};
console.log(`npm audit: ${counts.high ?? 0} altos, ${counts.critical ?? 0} críticos, ${result.advisories.length} avisos únicos (${today})`);
for (const note of result.notes) console.log(`  · ${note}`);
for (const problem of result.problems) console.error(`  ✗ ${problem}`);
console.log(result.ok ? "RESULTADO: OK (todo aviso alto está aceptado, vigente y sin parche)" : "RESULTADO: REQUIERE ACCIÓN");
process.exit(result.ok ? 0 : 1);
