import { describe, expect, it } from 'vitest';
import { initialOnboardingDraft, buildOnboardingPayload, validateOnboardingStep, type OnboardingDraft } from './onboardingModel';

const draft: OnboardingDraft = { name: ' Casa ', province: ' Santo Domingo ', municipality: ' Este ', sector: ' Alma Rosa ', distributor: 'EDEESTE', accountNumber: ' 001 22 ', userType: ' residencial ', occupants: '3', hasAc: true, hasWaterHeater: false, hasPool: false, hasSolar: false, hasInverter: true, goalAmount: '2500', goalKwh: '' };
describe('onboarding autenticado', () => {
  it('preserva desconocido como null y distingue Sí de No', () => {
    expect(buildOnboardingPayload(initialOnboardingDraft).home).toMatchObject({ has_ac: null, has_water_heater: null, has_pool: null, has_solar: null, has_inverter: null });
    expect(buildOnboardingPayload({ ...initialOnboardingDraft, hasAc: true, hasPool: false }).home).toMatchObject({ has_ac: true, has_pool: false, has_solar: null });
  });
  it('rechaza distribuidora desconocida sin esperar al servidor', () => {
    expect(validateOnboardingStep(1, { ...draft, distributor: 'desconocida' as OnboardingDraft['distributor'] })).toHaveProperty('distributor');
  });
  it('valida ubicación antes de avanzar', () => {
    expect(validateOnboardingStep(0, { ...draft, name: ' ' })).toHaveProperty('name');
    expect(validateOnboardingStep(0, draft)).toEqual({});
  });
  it('acepta tipo libre, no categorías regulatorias inventadas', () => {
    expect(validateOnboardingStep(2, { ...draft, userType: 'Autogenerador' })).toEqual({});
    expect(validateOnboardingStep(3, { ...draft, occupants: '0' })).toHaveProperty('occupants');
  });
  it('valida meta positiva y deja meta opcional', () => {
    expect(validateOnboardingStep(4, { ...draft, goalAmount: '-1' })).toHaveProperty('goalAmount');
    expect(buildOnboardingPayload({ ...draft, goalAmount: '', goalKwh: '' }).goal).toBeNull();
  });
  it('normaliza datos sin enviar números de cuenta vacíos ni perfil inventado', () => {
    expect(buildOnboardingPayload(draft)).toMatchObject({ home: { name: 'Casa', province: 'Santo Domingo', municipality: 'Este', sector: 'Alma Rosa', user_type: 'residencial', occupants: 3, has_ac: true, has_inverter: true }, accountNumber: '001 22', goal: { monthly_amount_rd: '2500', monthly_kwh: null } });
    expect(buildOnboardingPayload({ ...draft, accountNumber: ' ' }).accountNumber).toBeNull();
  });
});
