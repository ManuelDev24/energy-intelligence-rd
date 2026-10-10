// ERD-SEC-DEPS-MONITOR: decide si el resultado de `npm audit --json` está cubierto por una aceptación vigente.
// Lógica pura (sin red ni disco) para poder probarla; el cableado está en audit-monitor.mjs.

const BLOCKING = new Set(["high", "critical"]);

/** Avisos únicos (no paquetes transitivos): cada objeto `via` de npm es un aviso con su GHSA en la URL. */
export function collectAdvisories(audit) {
  const found = new Map();
  for (const vulnerability of Object.values(audit.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      if (typeof via !== "object") continue;
      const ghsa = /GHSA-[a-z0-9-]+/i.exec(via.url ?? "")?.[0]?.toUpperCase();
      const id = ghsa ?? `npm-${via.source}`;
      if (!found.has(id)) found.set(id, { id, package: via.name, severity: via.severity, range: via.range, url: via.url });
    }
  }
  return [...found.values()];
}

/**
 * @param audit      salida de `npm audit --json`
 * @param accepted   contenido de docs/security/accepted-advisories.json
 * @param patched    { [ghsa]: string[] } versiones publicadas que salen del rango vulnerable (vacío = sin parche)
 * @param today      "YYYY-MM-DD"
 * @returns {{ok: boolean, problems: string[], notes: string[], advisories: object[]}}
 */
export function evaluate({ audit, accepted, patched = {}, today }) {
  const problems = [];
  const notes = [];
  const advisories = collectAdvisories(audit);
  const byId = new Map((accepted.accepted ?? []).map((entry) => [entry.ghsa.toUpperCase(), entry]));

  for (const advisory of advisories) {
    if (!BLOCKING.has(advisory.severity)) continue;
    const entry = byId.get(advisory.id);
    if (!entry) {
      problems.push(`SIN ACEPTAR: ${advisory.id} (${advisory.package}, ${advisory.severity}) no está en accepted-advisories.json`);
      continue;
    }
    if (today > entry.review_by) {
      problems.push(`ACEPTACIÓN VENCIDA: ${advisory.id} (${advisory.package}) debía revisarse el ${entry.review_by}`);
    }
    const fixes = patched[advisory.id] ?? [];
    if (fixes.length > 0) {
      problems.push(`PARCHE DISPONIBLE: ${advisory.package} ${fixes.at(-1)} sale del rango vulnerable (${advisory.range}); actualizar y retirar la aceptación de ${advisory.id}`);
    } else {
      notes.push(`${advisory.id} (${advisory.package}): sin parche publicado; aceptación vigente hasta revisar el ${entry.review_by}`);
    }
  }
  const present = new Set(advisories.map((a) => a.id));
  for (const entry of accepted.accepted ?? []) {
    if (!present.has(entry.ghsa.toUpperCase())) {
      problems.push(`ACEPTACIÓN OBSOLETA: ${entry.ghsa} ya no aparece en la auditoría; retirarla de accepted-advisories.json`);
    }
  }
  return { ok: problems.length === 0, problems, notes, advisories };
}

/** Salida de `npm view pkg@"<rango>" version --json`: texto vacío, un string, un array o {"error":{...}} (E404 = ninguna). */
export function parseRegistryVersions(output) {
  const text = (output ?? "").trim();
  if (!text) return [];
  const value = JSON.parse(text);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (value.error?.code === "E404") return [];
    throw new Error(`Respuesta inesperada del registro: ${JSON.stringify(value).slice(0, 200)}`);
  }
  return [].concat(value).filter((item) => typeof item === "string");
}
