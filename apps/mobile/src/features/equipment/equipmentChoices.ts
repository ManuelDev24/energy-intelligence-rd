// ERD-DEV-02: opciones del formulario de equipos (puras, con prueba). Los catálogos viven en @energyrd/core.
import {
  DEFAULT_ICON_BY_KIND, EQUIPMENT_ICON_LABELS, EQUIPMENT_ICONS, EQUIPMENT_KIND_LABELS, EQUIPMENT_KINDS,
  isEquipmentKind, type EquipmentFormValues,
} from '@energyrd/core';

import type { Equipment } from '../../api/types';
import type { Choice } from '../../components/ChoiceGrid';
import { IONICON_BY_ICON } from '../../components/deviceCardModel';

export const KIND_CHOICES: readonly Choice<string>[] = EQUIPMENT_KINDS.map((k) => ({
  key: k,
  label: EQUIPMENT_KIND_LABELS[k],
  icon: IONICON_BY_ICON[DEFAULT_ICON_BY_KIND[k]],
}));

/** «' '» = icono por defecto del tipo; luego los del catálogo, solo con icono (el nombre queda para el lector de pantalla). */
export const ICON_CHOICES: readonly Choice<string>[] = [
  { key: '', label: 'Por defecto del tipo', icon: 'sparkles-outline' },
  ...EQUIPMENT_ICONS.map((i) => ({ key: i, label: EQUIPMENT_ICON_LABELS[i], icon: IONICON_BY_ICON[i] })),
];

/** Valores del formulario a partir de un equipo guardado (un tipo desconocido cae en «Otro», nunca se adivina otro). */
export function equipmentFormFrom(e: Equipment): EquipmentFormValues {
  return {
    name: e.name,
    room: e.room ?? '',
    kind: isEquipmentKind(e.kind) ? e.kind : 'other',
    brand: e.brand ?? '',
    model: e.model ?? '',
    icon: e.icon ?? '',
    powerW: String(Number(e.power_w)),
    hoursPerDay: String(Number(e.hours_per_day)),
  };
}
