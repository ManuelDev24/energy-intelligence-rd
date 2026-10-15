/** ERD-ADM-HOMES-WEB: tipos y reglas puras de la consulta de viviendas (solo lectura, sin datos de identificación). */
export type AdminHome = {
  id: string; code: string | null; distributor: string; province: string | null; created_at: string;
  members: number; bills: number; last_bill_end: string | null; open_claims: number; unread_alerts: number;
};
export type AdminHomeDetail = AdminHome & {
  user_type: string | null; occupants: number | null; has_ac: boolean | null; has_water_heater: boolean | null; has_pool: boolean | null;
  has_solar: boolean | null; has_inverter: boolean | null; owners: number; pending_invitations: number; first_bill_start: string | null;
  readings: number; equipment: number; documents: number; claims_total: number; outages: number;
};
export type AdminHomesPage = { items: AdminHome[]; total: number; limit: number; offset: number };

export const HOMES_PAGE_SIZE = 25;
export const MIN_HOME_QUERY = 3;
export const DISTRIBUTORS = ["EDESUR", "EDENORTE", "EDEESTE", "Otra"] as const;
export type DistributorFilter = "" | (typeof DISTRIBUTORS)[number];

const TERM = /^[A-Za-z0-9_-]{3,64}$/;

/** Mismo criterio que la API (código o identificador): devuelve el motivo o null. */
export function homeQueryProblem(q: string): string | null {
  const term = q.trim();
  if (term.length === 0) return null;
  return TERM.test(term) ? null : "Usa el código o el identificador de la vivienda (3 a 64 letras, números o guiones).";
}

export function buildHomesQuery(q: string, distributor: DistributorFilter, offset: number): string {
  const qs = new URLSearchParams();
  const term = q.trim();
  if (TERM.test(term)) qs.set("q", term);
  if (distributor) qs.set("distributor", distributor);
  qs.set("limit", String(HOMES_PAGE_SIZE));
  qs.set("offset", String(Math.max(0, offset)));
  return `?${qs.toString()}`;
}

const yesNo = (value: boolean | null) => (value === null ? "Sin dato" : value ? "Sí" : "No");
/** Filas de la ficha: solo conteos, atributos de contexto y fechas. */
export function homeDetailRows(h: AdminHomeDetail, formatDate: (iso: string | null) => string): Array<[string, string]> {
  return [
    ["Código", h.code ?? "Sin código"], ["Distribuidora", h.distributor], ["Provincia", h.province ?? "Sin dato"], ["Alta", formatDate(h.created_at)],
    ["Tipo de usuario", h.user_type ?? "Sin dato"], ["Ocupantes", h.occupants === null ? "Sin dato" : String(h.occupants)],
    ["Aire acondicionado", yesNo(h.has_ac)], ["Calentador de agua", yesNo(h.has_water_heater)], ["Piscina", yesNo(h.has_pool)],
    ["Paneles solares", yesNo(h.has_solar)], ["Inversor", yesNo(h.has_inverter)],
    ["Miembros", String(h.members)], ["Propietarios", String(h.owners)], ["Invitaciones pendientes", String(h.pending_invitations)],
    ["Facturas", String(h.bills)], ["Primera factura desde", formatDate(h.first_bill_start)], ["Última factura hasta", formatDate(h.last_bill_end)],
    ["Lecturas de medidor", String(h.readings)], ["Equipos", String(h.equipment)], ["Documentos", String(h.documents)],
    ["Reclamaciones abiertas", String(h.open_claims)], ["Reclamaciones totales", String(h.claims_total)],
    ["Alertas sin leer", String(h.unread_alerts)], ["Apagones registrados", String(h.outages)],
  ];
}
