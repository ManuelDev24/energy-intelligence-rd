// ERD-DEV-02 (móvil): modelo de la tarjeta de equipo, opciones del formulario y estructura de las pantallas.
import { readFileSync } from 'node:fs';
import { EQUIPMENT_ICONS, EQUIPMENT_KINDS } from '@energyrd/core';
import { describe, expect, it } from 'vitest';

import type { Equipment, EquipmentEstimate } from '../api/types';
import { equipmentFormFrom, ICON_CHOICES, KIND_CHOICES } from '../features/equipment/equipmentChoices';
import { deviceCardView, IONICON_BY_ICON } from './deviceCardModel';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const metric = (value: string, unit: string) => ({ value, unit, quality: 'ESTIMATED' as const });

const item: Equipment = {
  id: '00000000-0000-4000-8000-0000000000a1', home_id: '00000000-0000-4000-8000-000000000001', name: 'Aire sala', room: 'Sala',
  kind: 'air_conditioner', brand: 'Samsung', model: 'AR12', icon: null, power_w: '1500.00', hours_per_day: '6.00', created_at: '2026-10-01T00:00:00Z',
};
const est: EquipmentEstimate['items'][number] = {
  equipment_id: item.id, name: item.name, room: item.room, kind: item.kind, brand: item.brand, model: item.model, icon: item.icon,
  daily_kwh: metric('9.00', 'kWh/día'), monthly_kwh: metric('270.00', 'kWh/mes'), share_pct: metric('71.43', '%'),
};

describe('deviceCardView', () => {
  it('muestra tipo, habitación, marca, modelo, uso, estimado y el % calculado por el servidor', () => {
    const v = deviceCardView(item, est);
    expect(v.title).toBe('Aire sala');
    expect(v.subtitle).toBe('Aire acondicionado · Sala');
    expect(v.makeModel).toBe('Samsung AR12');
    expect(v.usage).toBe('1,500 W · 6 h/día');
    expect(v.monthly).toBe('≈ 270 kWh/mes');
    expect(v.share?.label).toBe('71.43%');
    expect(v.share?.ratio).toBeCloseTo(0.7143, 4);
    expect(v.accessibilityLabel).toContain('71.43% del consumo estimado');
    expect(v.accessibilityLabel).toContain('Samsung AR12');
  });

  it('el icono por defecto sale del tipo y el elegido manda', () => {
    expect(deviceCardView(item, est).iconName).toBe(IONICON_BY_ICON.snowflake);
    expect(deviceCardView({ ...item, icon: 'tv' }, est).iconName).toBe(IONICON_BY_ICON.tv);
  });

  it('sin estimado no inventa cifras y sin marca/modelo no pinta nada', () => {
    const v = deviceCardView({ ...item, brand: null, model: null, room: null });
    expect(v.monthly).toBeNull();
    expect(v.share).toBeNull();
    expect(v.makeModel).toBeNull();
    expect(v.subtitle).toBe('Aire acondicionado');
    expect(v.accessibilityLabel).not.toContain('estimado');
  });

  it('un porcentaje fuera de rango o ilegible no rompe la barra', () => {
    expect(deviceCardView(item, { ...est, share_pct: metric('250', '%') }).share?.ratio).toBe(1);
    expect(deviceCardView(item, { ...est, share_pct: metric('abc', '%') }).share?.ratio).toBe(0);
  });
});

describe('opciones del formulario', () => {
  it('cubren todo el catálogo, con un icono de Ionicons por entrada', () => {
    expect(KIND_CHOICES.map((c) => c.key)).toEqual([...EQUIPMENT_KINDS]);
    expect(ICON_CHOICES.map((c) => c.key)).toEqual(['', ...EQUIPMENT_ICONS]);
    expect(Object.keys(IONICON_BY_ICON).sort()).toEqual([...EQUIPMENT_ICONS].sort());
    for (const c of [...KIND_CHOICES, ...ICON_CHOICES]) expect(c.label && c.icon).toBeTruthy();
  });

  it('todos los iconos existen en Ionicons (el nombre equivocado se vería como «?» en el teléfono)', () => {
    const glyphs = JSON.parse(
      read('../../../../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json'),
    ) as Record<string, number>;
    for (const name of [...Object.values(IONICON_BY_ICON), 'sparkles-outline']) expect(glyphs[name], name).toBeDefined();
  });

  it('equipmentFormFrom conserva los datos y no adivina un tipo desconocido', () => {
    expect(equipmentFormFrom(item)).toEqual({
      name: 'Aire sala', room: 'Sala', kind: 'air_conditioner', brand: 'Samsung', model: 'AR12', icon: '', powerW: '1500', hoursPerDay: '6',
    });
    expect(equipmentFormFrom({ ...item, kind: 'robot' as never, brand: null, icon: 'fan' })).toMatchObject({ kind: 'other', brand: '', icon: 'fan' });
  });
});

describe('estructura de las pantallas', () => {
  it('la lista usa DeviceCard y la tarjeta expone acciones con el nombre del equipo', () => {
    expect(read('../features/equipment/EquipmentScreen.tsx')).toContain('<DeviceCard');
    const card = read('./DeviceCard.tsx');
    expect(card).toContain('accessibilityLabel={`Editar ${item.name}`}');
    expect(card).toContain('accessibilityLabel={`Eliminar ${item.name}`}');
    expect(card).toContain('accessibilityLabel={v.accessibilityLabel}');
  });

  it('el formulario ofrece tipo, marca, modelo e icono accesibles', () => {
    const form = read('../features/equipment/EquipmentFormScreen.tsx');
    for (const id of ['eq-kind', 'eq-brand', 'eq-model', 'eq-icon']) expect(form).toContain(id);
    const grid = read('./ChoiceGrid.tsx');
    expect(grid).toContain('accessibilityRole="radiogroup"');
    expect(grid).toContain('accessibilityRole="radio"');
    expect(grid).toContain('accessibilityState={{ selected, checked: selected }}');
    expect(grid).toContain('minHeight: TOUCH');
  });

  it('el desglose usa el % del servidor y no lo recalcula', () => {
    const chart = read('./charts/EquipmentBreakdown.tsx');
    expect(chart).toContain('share_pct');
    expect(read('./charts/chartMath.ts')).not.toContain('(r.value / total)');
  });
});
