import { describe, expect, it } from 'vitest';

import { EMPTY_EQUIPMENT_FORM, previewDailyKwh, validateEquipment, type EquipmentFormValues } from './validation';

const valid: EquipmentFormValues = { ...EMPTY_EQUIPMENT_FORM, name: 'Nevera', room: 'Cocina', kind: 'refrigerator', powerW: '150', hoursPerDay: '24' };

describe('validateEquipment', () => {
  it('accepts a valid equipment and trims text', () => {
    const { errors, input } = validateEquipment({ ...valid, name: '  Nevera ', room: '  ' });
    expect(errors).toEqual({});
    expect(input).toEqual({ name: 'Nevera', room: null, kind: 'refrigerator', brand: null, model: null, icon: null, power_w: '150', hours_per_day: '24' });
  });

  it('accepts zero power and zero hours', () => {
    expect(validateEquipment({ ...valid, powerW: '0', hoursPerDay: '0' }).errors).toEqual({});
  });

  it.each([
    ['powerW', '-1'],
    ['hoursPerDay', '-0.5'],
    ['hoursPerDay', '24.5'],
    ['powerW', '100001'],
    ['powerW', 'abc'],
    ['hoursPerDay', ''],
    ['name', '   '],
    ['hoursPerDay', '1.234'],
    ['kind', 'toaster'],
    ['kind', ''],
    ['icon', 'skull'],
    ['brand', 'x'.repeat(61)],
    ['model', 'x'.repeat(61)],
  ])('rejects %s = %j', (field, val) => {
    const { errors, input } = validateEquipment({ ...valid, [field]: val } as EquipmentFormValues);
    expect(errors[field as keyof EquipmentFormValues]).toBeDefined();
    expect(input).toBeNull();
  });

  it('trims brand and model, keeps a chosen icon and turns blanks into null', () => {
    const { input } = validateEquipment({ ...valid, kind: 'air_conditioner', brand: ' LG ', model: '  ', icon: 'fan' });
    expect(input).toMatchObject({ kind: 'air_conditioner', brand: 'LG', model: null, icon: 'fan' });
  });

  it('accepts decimal comma', () => {
    expect(validateEquipment({ ...valid, hoursPerDay: '1,5' }).input?.hours_per_day).toBe('1.5');
  });
});

describe('previewDailyKwh', () => {
  it('computes W × h / 1000', () => expect(previewDailyKwh(valid)).toBe(3.6));
  it('returns null on invalid input', () => expect(previewDailyKwh({ ...valid, powerW: '-1' })).toBeNull());
});
