import { describe, expect, it, vi } from "vitest";
import { ApiError, ContractError, createApiClient } from "./index";

// QA móvil con la API apagada (iOS, Expo Go): el fetch nativo rechaza con un Error que NO es TypeError
// y la app decía "La respuesta del servidor no cumple el contrato". Sin respuesta no hay contrato que
// violar: cualquier fallo al obtener la respuesta es un error de conexión (status 0).
describe("fallo de red antes de recibir respuesta", () => {
  it.each([
    ["TypeError (navegador)", new TypeError("Failed to fetch")],
    ["Error genérico (React Native / Expo)", new Error("Network request failed")],
    ["objeto no Error", { message: "socket hang up" }],
  ])("%s → ApiError(0), nunca ContractError", async (_label, failure) => {
    const fetcher = vi.fn().mockRejectedValue(failure);
    const error = await createApiClient("http://api.test", fetcher).listHomes().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(ContractError);
    expect((error as ApiError).status).toBe(0);
  });

  it("una respuesta 200 con JSON inválido sigue siendo ContractError", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("<html>proxy</html>", { status: 200 }));
    await expect(createApiClient("http://api.test", fetcher).listHomes()).rejects.toBeInstanceOf(ContractError);
  });
});
