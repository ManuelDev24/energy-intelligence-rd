/** ERD-ADM-TARIFFS-WEB: tipos y reglas puras de la vista de tarifas (datos públicos de la SIE, solo lectura). */
export type Coverage = {
  distributor: string; tariff_code: string; status: "current" | "expiring" | "future_only" | "missing"; current_id: string | null;
  effective_from: string | null; effective_to: string | null; days_left: number | null; next_from: string | null; last_ended: string | null;
};
export type TariffVersion = {
  id: string; distributor: string; tariff_code: string; effective_from: string; effective_to: string | null; flat_all_units_from_kwh: string | null;
  fixed_charges: Array<{ from_kwh: string; to_kwh: string | null; amount_rd: string }>;
  blocks: Array<{ from_kwh: string; to_kwh: string | null; price_rd_per_kwh: string }>;
  source_resolution: string; source_url: string | null; scope_note: string | null; state: "current" | "past" | "future";
};
export type TariffsOverview = { today: string; warn_days: number; coverage: Coverage[]; versions: TariffVersion[] };

export type Severity = "ok" | "warning" | "critical";
const day = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");

/** Texto y gravedad de cada distribuidora. «Crítico» = hoy no hay tarifa y los costos en RD$ salen como «no disponible». */
export function coverageView(c: Coverage): { severity: Severity; label: string; detail: string } {
  switch (c.status) {
    case "current":
      return { severity: "ok", label: "Vigente",
        detail: c.effective_to === null ? "Sin fecha de fin."
          : c.next_from ? `Vigente hasta ${day(c.effective_to)}; la versión siguiente empieza el ${day(c.next_from)}.` : `Vigente hasta ${day(c.effective_to)} (${c.days_left} días).` };
    case "expiring":
      return { severity: "warning", label: "Vence pronto sin reemplazo",
        detail: `${c.days_left === 0 ? "Hoy es el último día" : `Quedan ${c.days_left} días`} (hasta ${day(c.effective_to)}) y no hay una versión siguiente cargada. Después, los costos en RD$ pasarán a «tarifa no disponible».` };
    case "future_only":
      return { severity: "critical", label: "Aún sin tarifa vigente", detail: `La primera versión empieza el ${day(c.next_from)}. Hasta entonces los costos en RD$ no están disponibles.` };
    default:
      return { severity: "critical", label: "Sin tarifa vigente",
        detail: c.last_ended ? `La última versión terminó el ${day(c.last_ended)}. Los costos en RD$ no están disponibles.` : "No hay ninguna versión cargada. Los costos en RD$ no están disponibles." };
  }
}

export const SEVERITY_TEXT: Record<Severity, string> = { ok: "Bien", warning: "Atención", critical: "Sin cobertura" };
export const STATE_TEXT: Record<TariffVersion["state"], string> = { current: "Vigente", past: "Vencida", future: "Futura" };

/** Formato propio (punto de millar, coma decimal): no depende de los datos de idioma del sistema, así sale igual en el navegador y en CI. */
function num(value: string, decimals: number): string {
  const [int, frac = ""] = Number(value).toFixed(decimals).split(".");
  const thousands = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return frac ? `${thousands},${frac}` : thousands;
}
/** Rango de un bloque «(desde, hasta]» en kWh; sin tope se dice «más de». */
export function rangeText(from: string, to: string | null): string {
  const n = (v: string) => num(v, Number.isInteger(Number(v)) ? 0 : 2);
  return to === null ? `más de ${n(from)} kWh` : `${n(from)} a ${n(to)} kWh`;
}
export const rd = (v: string) => `RD$ ${num(v, 2)}`;
export const kwh = (v: string) => num(v, Number.isInteger(Number(v)) ? 0 : 2);

/** Peor estado entre las distribuidoras, para un aviso general arriba de la página. */
export function worst(rows: Coverage[]): Severity {
  const sev = rows.map((r) => coverageView(r).severity);
  return sev.includes("critical") ? "critical" : sev.includes("warning") ? "warning" : "ok";
}
