import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ICON_BY_KIND, EQUIPMENT_ICON_LABELS, EQUIPMENT_ICONS, EQUIPMENT_KIND_LABELS, EQUIPMENT_KINDS,
  equipmentIcon, equipmentKindLabel, equipmentMakeModel, shareWidth,
} from './equipmentCatalog';

describe('catálogo de equipos (ERD-DEV-02)', () => {
  it('cada tipo e icono tiene etiqueta y el icono por defecto existe', () => {
    for (const k of EQUIPMENT_KINDS) {
      expect(EQUIPMENT_KIND_LABELS[k]).toBeTruthy();
      expect(EQUIPMENT_ICONS).toContain(DEFAULT_ICON_BY_KIND[k]);
    }
    for (const i of EQUIPMENT_ICONS) expect(EQUIPMENT_ICON_LABELS[i]).toBeTruthy();
    expect(new Set(EQUIPMENT_KINDS).size).toBe(EQUIPMENT_KINDS.length);
    expect(new Set(EQUIPMENT_ICONS).size).toBe(EQUIPMENT_ICONS.length);
  });

  it('el icono elegido gana; sin él se usa el del tipo; lo desconocido cae al enchufe', () => {
    expect(equipmentIcon({ kind: 'air_conditioner', icon: 'fan' })).toBe('fan');
    expect(equipmentIcon({ kind: 'air_conditioner', icon: null })).toBe('snowflake');
    expect(equipmentIcon({ kind: 'robot', icon: 'skull' })).toBe('plug');
    expect(equipmentIcon({})).toBe('plug');
  });

  it('etiqueta del tipo con respaldo «Otro»', () => {
    expect(equipmentKindLabel('tv')).toBe('Televisor');
    expect(equipmentKindLabel('nope')).toBe('Otro');
    expect(equipmentKindLabel(undefined)).toBe('Otro');
  });

  it('marca y modelo se unen sin inventar nada', () => {
    expect(equipmentMakeModel({ brand: 'LG', model: 'X1' })).toBe('LG X1');
    expect(equipmentMakeModel({ brand: 'LG', model: null })).toBe('LG');
    expect(equipmentMakeModel({ brand: ' ', model: 'X1' })).toBe('X1');
    expect(equipmentMakeModel({ brand: null, model: null })).toBeNull();
  });

  it('shareWidth acota a 0–100 y tolera basura', () => {
    expect(shareWidth('71.43')).toBe(71.43);
    expect(shareWidth('150')).toBe(100);
    expect(shareWidth(-3)).toBe(0);
    expect(shareWidth('abc')).toBe(0);
    expect(shareWidth(null)).toBe(0);
  });
});
