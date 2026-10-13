// ERD-DEV-02: catálogo cerrado de tipos e iconos de equipo. Debe coincidir con `EQUIPMENT_KINDS` / `EQUIPMENT_ICONS` de
// `services/api/app/models/equipment.py`; un test en `@energyrd/api-contracts` compara ambos con el contrato generado.

export const EQUIPMENT_KINDS = [
  'air_conditioner', 'refrigerator', 'water_heater', 'washing_machine', 'tv', 'fan',
  'lighting', 'computer', 'microwave', 'pool_pump', 'other',
] as const;
export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number];

/** Claves semánticas de icono; cada app las traduce a su librería (lucide en la web, Ionicons en el móvil). */
export const EQUIPMENT_ICONS = [
  'snowflake', 'refrigerator', 'flame', 'washing-machine', 'tv', 'fan',
  'lightbulb', 'laptop', 'microwave', 'waves', 'plug',
] as const;
export type EquipmentIcon = (typeof EQUIPMENT_ICONS)[number];

export const EQUIPMENT_KIND_LABELS: Record<EquipmentKind, string> = {
  air_conditioner: 'Aire acondicionado',
  refrigerator: 'Nevera',
  water_heater: 'Calentador de agua',
  washing_machine: 'Lavadora',
  tv: 'Televisor',
  fan: 'Abanico',
  lighting: 'Iluminación',
  computer: 'Computadora',
  microwave: 'Microondas',
  pool_pump: 'Bomba de piscina',
  other: 'Otro',
};

/** Icono por defecto de cada tipo (mismo orden que los catálogos). */
export const DEFAULT_ICON_BY_KIND: Record<EquipmentKind, EquipmentIcon> = Object.fromEntries(
  EQUIPMENT_KINDS.map((kind, i) => [kind, EQUIPMENT_ICONS[i]]),
) as Record<EquipmentKind, EquipmentIcon>;

export const EQUIPMENT_ICON_LABELS: Record<EquipmentIcon, string> = {
  snowflake: 'Copo de nieve',
  refrigerator: 'Nevera',
  flame: 'Llama',
  'washing-machine': 'Lavadora',
  tv: 'Televisor',
  fan: 'Abanico',
  lightbulb: 'Bombillo',
  laptop: 'Computadora',
  microwave: 'Microondas',
  waves: 'Olas',
  plug: 'Enchufe',
};

export const isEquipmentKind = (v: unknown): v is EquipmentKind => (EQUIPMENT_KINDS as readonly unknown[]).includes(v);
export const isEquipmentIcon = (v: unknown): v is EquipmentIcon => (EQUIPMENT_ICONS as readonly unknown[]).includes(v);

/** Icono a mostrar: el elegido o, si no hay (o es desconocido), el del tipo; nunca falla. */
export function equipmentIcon(item: { kind?: string | null; icon?: string | null }): EquipmentIcon {
  if (isEquipmentIcon(item.icon)) return item.icon;
  return isEquipmentKind(item.kind) ? DEFAULT_ICON_BY_KIND[item.kind] : 'plug';
}

export const equipmentKindLabel = (kind: string | null | undefined): string =>
  isEquipmentKind(kind) ? EQUIPMENT_KIND_LABELS[kind] : EQUIPMENT_KIND_LABELS.other;

/** «Samsung AR12», «Samsung» o «AR12»; null si no hay ninguno. */
export function equipmentMakeModel(item: { brand?: string | null; model?: string | null }): string | null {
  const text = [item.brand, item.model].map((x) => x?.trim()).filter(Boolean).join(' ');
  return text || null;
}

/** Parte de un total (0–100) lista para barras de progreso; tolera textos Decimal y valores fuera de rango. */
export function shareWidth(pct: string | number | null | undefined): number {
  const n = typeof pct === 'string' ? Number(pct) : pct;
  if (n === null || n === undefined || !Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}
