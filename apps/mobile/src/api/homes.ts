import { ApiError, ContractError } from '@energyrd/api-client';
import { HomeSchema, type Distributor, type Home } from '@energyrd/api-contracts';
import { localApiError, serverError } from './errors';

export interface HomeInput { name: string; distributor: Distributor }
export function createHomeApi(baseUrl: string, fetchImpl: typeof fetch) {
  return { createHome: async (input: HomeInput): Promise<Home> => {
    const name = input.name.trim();
    if (!name || Array.from(name).length > 120 || !HomeSchema.shape.distributor.safeParse(input.distributor).success)
      throw localApiError(422, 'Revise el nombre y la distribuidora.');
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { ctrl.abort(); reject(localApiError(0, 'No se pudo confirmar la creación. Actualice sus viviendas antes de volver a intentar.')); }, 10_000);
    });
    try {
      return await Promise.race([timeout, (async () => {
        const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/api/v1/homes`, {
          method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          // Membership is assigned by the server; no owner/user/pilot/code supplied.
          body: JSON.stringify({ name, distributor: input.distributor }),
        });
        const body: unknown = await response.json();
        if (!response.ok) throw serverError(response.status, body);
        const parsed = HomeSchema.safeParse(body);
        if (!parsed.success) throw new ContractError();
        return parsed.data;
      })()]);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof TypeError) throw localApiError(0, 'No se pudo confirmar la creación. Actualice sus viviendas antes de volver a intentar.');
      throw new ContractError();
    } finally { clearTimeout(timer!); }
  } };
}
