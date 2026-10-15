import { ApiError } from '@energyrd/api-client';
import { sanitizeApiError } from '../../api/errors';
import { expect, it } from 'vitest';
import { HomeOutSchema } from '@energyrd/api-contracts';
import { profileDraft, validateProfile, profilePayload, profilePatch, profileServerErrors } from './model';
const home = HomeOutSchema.parse({ id: '11111111-1111-4111-8111-111111111111', name: 'Casa', code: null, address: null, city: null, distributor: 'EDESUR', created_at: '2026-01-01T00:00:00Z', has_ac: null, has_pool: false, has_solar: true });
it('PATCH omite untouched y null solo representa limpieza explícita', () => {
  const baseline = profileDraft({ ...home, sector: 'Norte', has_ac: true });
  expect(profilePatch({ ...baseline, name: 'Casa editada' }, baseline)).toEqual({ name: 'Casa editada' });
  expect(profilePatch({ ...baseline, sector: '', hasAc: null }, baseline)).toEqual({ sector: null, has_ac: null });
  expect(profilePatch({ ...baseline, name: ' Casa ' }, baseline)).toEqual({});
});
it('asocia errores 422 seguros con los campos visibles sin texto upstream', () => {
  const error = sanitizeApiError(new ApiError(422, 'private', { user_type: 'private', occupants: 'private', account_number: 'private' }));
  expect(profileServerErrors(error)).toEqual({ userType: 'Describa el tipo de usuario con hasta 120 caracteres.', occupants: 'Ingrese entre 1 y 999 ocupantes.', accountNumber: 'Ingrese un número de contrato de 1 a 120 caracteres.' });
  expect(profileServerErrors(new Error('private'))).toEqual({});
});
it('rechaza campos largos y ocupantes no enteros antes de PATCH', () => {
  expect(validateProfile({ ...profileDraft(home), name: ' ', province: 'x'.repeat(121), municipality: 'x'.repeat(121), userType: 'x'.repeat(121), address: 'x'.repeat(256), city: 'x'.repeat(121), occupants: '1.5' })).toMatchObject({ name: expect.any(String), province: expect.any(String), municipality: expect.any(String), userType: expect.any(String), address: expect.any(String), city: expect.any(String), occupants: expect.any(String) });
  expect(validateProfile({ ...profileDraft(home), accountNumber: '😀'.repeat(120), occupants: '999' })).toEqual({});
});
it('hidrata y serializa el perfil real sin completar desconocidos ni inventar contrato o metas', () => {
  const draft = profileDraft(home);
  expect(draft).toMatchObject({ hasAc: null, hasPool: false, hasSolar: true, occupants: '' });
  expect(validateProfile(draft)).toEqual({});
  expect(profilePayload(draft)).toEqual({ name: 'Casa', distributor: 'EDESUR', province: null, municipality: null, sector: null, user_type: null, occupants: null, has_ac: null, has_water_heater: null, has_pool: false, has_solar: true, has_inverter: null, address: null, city: null });
});
