import { expect, it } from 'vitest';
import { serverError, describeError } from './errors';
it('mapea campos de perfil y contrato a instrucciones locales, descarta contenido upstream', () => {
  const fields = ['province', 'municipality', 'sector', 'user_type', 'occupants', 'has_ac', 'has_water_heater', 'has_pool', 'has_solar', 'has_inverter', 'address', 'city', 'account_number'];
  const error = serverError(422, { detail: [...fields, 'unknown'].map(field => ({ loc: ['body', field], msg: 'private upstream content' })) });
  expect(Object.keys(error.fieldErrors).sort()).toEqual(fields.sort());
  expect(JSON.stringify(error.fieldErrors)).not.toContain('private upstream');
  expect(describeError(error).message).toBe('Revise los campos indicados.');
});
