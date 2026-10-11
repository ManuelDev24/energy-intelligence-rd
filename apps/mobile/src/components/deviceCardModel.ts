// ERD-DEV-02: modelo (puro y probado) de la tarjeta de equipo. Los números salen de la API; aquí solo se presentan.
import {
  equipmentIcon, equipmentKindLabel, equipmentMakeModel, fmtMetric, fmtNumber, shareWidth,
  type EquipmentIcon,
} from '@energyrd/core';

import type { Equipment, EquipmentEstimate } from '../api/types';

type EstimateItem = EquipmentEstimate['items'][number];

/** Icono semántico → nombre de Ionicons (todos existen en @expo/vector-icons; lo vigila una prueba). */
export const IONICON_BY_ICON: Record<EquipmentIcon, string> = {
  snowflake: 'snow-outline',
  refrigerator: 'cube-outline',
  flame: 'flame-outline',
  'washing-machine': 'shirt-outline',
  tv: 'tv-outline',
  fan: 'sync-outline',
  lightbulb: 'bulb-outline',
  laptop: 'laptop-outline',
  microwave: 'restaurant-outline',
  waves: 'water-outline',
  plug: 'flash-outline',
};

export interface DeviceCardView {
  iconName: string;
  title: string;
  /** «Aire acondicionado · Sala» */
  subtitle: string;
  makeModel: string | null;
  usage: string;
  monthly: string | null;
  share: { label: string; ratio: number } | null;
  accessibilityLabel: string;
}

export function deviceCardView(item: Equipment, est?: EstimateItem): DeviceCardView {
  const hours = Number(item.hours_per_day);
  const usage = `${fmtNumber(item.power_w, 0)} W · ${fmtNumber(item.hours_per_day, hours % 1 ? 2 : 0)} h/día`;
  const subtitle = [equipmentKindLabel(item.kind), item.room].filter(Boolean).join(' · ');
  const makeModel = equipmentMakeModel(item);
  const monthly = est ? `≈ ${fmtMetric(est.monthly_kwh.value, 'kWh')}/mes` : null;
  const share = est ? { label: fmtMetric(est.share_pct.value, '%'), ratio: shareWidth(est.share_pct.value) / 100 } : null;
  const parts = [item.name, subtitle, makeModel, usage, monthly && `estimado ${monthly.replace('≈ ', '')}`, share && `${share.label} del consumo estimado de sus equipos`];
  return {
    iconName: IONICON_BY_ICON[equipmentIcon(item)],
    title: item.name,
    subtitle,
    makeModel,
    usage,
    monthly,
    share,
    accessibilityLabel: parts.filter(Boolean).join('. '),
  };
}
