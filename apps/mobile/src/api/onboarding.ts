import { ContractError } from '@energyrd/api-client';
import { ContractOutSchema, GoalOutSchema, HomeOutSchema, type Distributor, type GoalInput } from '@energyrd/api-contracts';
import type { z } from 'zod';
import { localApiError, serverError } from './errors';

export type OnboardingHomeInput = { name: string; distributor: Distributor; province?: string | null; municipality?: string | null; sector?: string | null; user_type?: string | null; occupants?: number | null; has_ac?: boolean | null; has_water_heater?: boolean | null; has_pool?: boolean | null; has_solar?: boolean | null; has_inverter?: boolean | null };
export function createOnboardingApi(baseUrl: string, transport: typeof fetch) {
  const request = async <T extends z.ZodTypeAny>(path: string, method: string, input: unknown, schema: T): Promise<z.output<T>> => {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { ctrl.abort(); reject(localApiError(0, 'No se pudo confirmar la operación. Actualice los datos antes de volver a intentar.')); }, 10_000);
    });
    try {
      return await Promise.race([timeout, (async () => {
        const response = await transport(`${baseUrl.replace(/\/+$/, '')}${path}`, { method, signal: ctrl.signal, headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
        let body: unknown;
        try { body = await response.json(); } catch { if (!response.ok) throw serverError(response.status, null); throw new ContractError(); }
        if (!response.ok) throw serverError(response.status, body);
        const parsed = schema.safeParse(body);
        if (!parsed.success) throw new ContractError();
        const requestedId = path.match(/^\/api\/v1\/homes\/([^/]+)(?:\/|$)/)?.[1];
        const value = parsed.data as { id?: string; home_id?: string };
        if (requestedId && decodeURIComponent(requestedId) !== (value.home_id ?? value.id)) throw new ContractError();
        return parsed.data;
      })()]);
    } catch (error) {
      if (error instanceof TypeError || (error instanceof Error && error.name === 'AbortError')) throw localApiError(0, 'No se pudo confirmar la operación. Actualice los datos antes de volver a intentar.');
      throw error;
    } finally { clearTimeout(timer); }
  };
  return {
    createHome: (input: OnboardingHomeInput) => request('/api/v1/homes', 'POST', input, HomeOutSchema),
    getHome: (homeId: string) => request(`/api/v1/homes/${encodeURIComponent(homeId)}`, 'GET', undefined, HomeOutSchema),
    updateHome: (homeId: string, input: Partial<OnboardingHomeInput> & { address?: string | null; city?: string | null }) => request(`/api/v1/homes/${encodeURIComponent(homeId)}`, 'PATCH', input, HomeOutSchema),
    getContract: (homeId: string) => request(`/api/v1/homes/${encodeURIComponent(homeId)}/contract`, 'GET', undefined, ContractOutSchema),
    putContract: (homeId: string, number: string) => {
      const account_number = number.trim();
      if (!account_number || Array.from(account_number).length > 120) throw localApiError(422, 'Ingrese un número de contrato válido.');
      return request(`/api/v1/homes/${encodeURIComponent(homeId)}/contract`, 'PUT', { account_number }, ContractOutSchema);
    },
    putGoal: (homeId: string, goal: GoalInput) => request(`/api/v1/homes/${encodeURIComponent(homeId)}/goal`, 'PUT', goal, GoalOutSchema),
  };
}
