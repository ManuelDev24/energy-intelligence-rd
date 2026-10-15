import type { Distributor, GoalInput } from '@energyrd/api-contracts';
import { validateGoal } from '../goals/form';

export interface OnboardingDraft {
  name: string; province: string; municipality: string; sector: string;
  distributor: Distributor; accountNumber: string; userType: string; occupants: string;
  hasAc: boolean | null; hasWaterHeater: boolean | null; hasPool: boolean | null; hasSolar: boolean | null; hasInverter: boolean | null;
  goalAmount: string; goalKwh: string;
}
export const initialOnboardingDraft: OnboardingDraft = {
  name: '', province: '', municipality: '', sector: '', distributor: 'EDESUR', accountNumber: '',
  userType: '', occupants: '', hasAc: null, hasWaterHeater: null, hasPool: null,
  hasSolar: null, hasInverter: null, goalAmount: '', goalKwh: '',
};
export const onboardingTitles = ['Ubicación', 'Distribuidora y contrato', 'Tipo de usuario', 'Perfil energético', 'Objetivo mensual', 'Revisar y comenzar'] as const;
export type OnboardingErrors = Partial<Record<keyof OnboardingDraft, string>>;
const validText = (s: string) => !!s.trim() && Array.from(s.trim()).length <= 120;
export function validateOnboardingStep(step: number, v: OnboardingDraft): OnboardingErrors {
  const e: OnboardingErrors = {};
  if (step === 0) {
    if (!validText(v.name)) e.name = 'Ingrese un nombre de 1 a 120 caracteres.';
    if (!validText(v.province)) e.province = 'Ingrese una provincia de 1 a 120 caracteres.';
    if (!validText(v.municipality)) e.municipality = 'Ingrese un municipio de 1 a 120 caracteres.';
    if (v.sector.trim() && !validText(v.sector)) e.sector = 'Máximo 120 caracteres.';
  }
  if (step === 1 && !['EDESUR', 'EDENORTE', 'EDEESTE', 'Otra'].includes(v.distributor)) e.distributor = 'Seleccione una distribuidora válida.';
  if (step === 1 && Array.from(v.accountNumber.trim()).length > 120) e.accountNumber = 'Máximo 120 caracteres.';
  if (step === 2 && !validText(v.userType)) e.userType = 'Describa el tipo de usuario (1 a 120 caracteres).';
  if (step === 3 && v.occupants.trim() && (!/^[0-9]+$/.test(v.occupants.trim()) || Number(v.occupants) < 1 || Number(v.occupants) > 999)) e.occupants = 'Ingrese entre 1 y 999 ocupantes.';
  if (step === 4 && (v.goalAmount.trim() || v.goalKwh.trim())) {
    const result = validateGoal({ amount: v.goalAmount, kwh: v.goalKwh });
    if (result.errors.amount) e.goalAmount = result.errors.amount;
    if (result.errors.kwh) e.goalKwh = result.errors.kwh;
  }
  return e;
}
export function buildOnboardingPayload(v: OnboardingDraft): {
  home: { name: string; distributor: Distributor; province: string; municipality: string; sector: string | null; user_type: string; occupants: number | null; has_ac: boolean | null; has_water_heater: boolean | null; has_pool: boolean | null; has_solar: boolean | null; has_inverter: boolean | null };
  accountNumber: string | null; goal: GoalInput | null;
} {
  const text = (s: string) => s.trim();
  return {
    home: { name: text(v.name), distributor: v.distributor, province: text(v.province), municipality: text(v.municipality), sector: text(v.sector) || null, user_type: text(v.userType), occupants: v.occupants.trim() ? Number(v.occupants.trim()) : null, has_ac: v.hasAc, has_water_heater: v.hasWaterHeater, has_pool: v.hasPool, has_solar: v.hasSolar, has_inverter: v.hasInverter },
    accountNumber: text(v.accountNumber) || null,
    goal: v.goalAmount.trim() || v.goalKwh.trim() ? validateGoal({ amount: v.goalAmount, kwh: v.goalKwh }).input : null,
  };
}
