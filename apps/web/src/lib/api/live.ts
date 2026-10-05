import { createApiClient } from "@energyrd/api-client";
import type { Api } from "./types";

export function createLiveApi(baseUrl: string, fetchImpl: typeof fetch = fetch): Api {
  return createApiClient(baseUrl, fetchImpl);
}
