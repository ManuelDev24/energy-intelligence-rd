import { HomeSchema, type Distributor } from "@energyrd/api-contracts";
import { ApiError, ContractError, parseErrorBody } from "@energyrd/api-client";
import { AccountChangedError, accountGeneration, assertAccountGeneration, bffFetch } from "./client";
export async function createOwnedHome(name: string, distributor: Distributor) {
  const current = accountGeneration();
  let response: Response;
  try {
    response = await bffFetch("/api/v1/homes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, distributor }) });
  } catch (cause) {
    if (cause instanceof AccountChangedError) throw cause;
    throw new ApiError(0, "No se pudo confirmar la creación. Revisa Mis viviendas antes de intentarlo de nuevo.");
  }
  let body: unknown;
  try { body = await response.json(); }
  catch (cause) { if (cause instanceof AccountChangedError) throw cause; body = undefined; }
  if (!response.ok) throw parseErrorBody(response.status, body);
  const home = HomeSchema.safeParse(body);
  if (!home.success) throw new ContractError();
  // Never resolve a composite operation into a different account's session.
  assertAccountGeneration(current);
  return home.data;
}
