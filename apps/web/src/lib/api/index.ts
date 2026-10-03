import { env } from "@/lib/env";
import { createLiveApi } from "./live";
import { createMockApi } from "./mock";
import type { Api } from "./types";

let instance: Api | undefined;

// El modo se elige explícitamente con NEXT_PUBLIC_API_MODE (mock | live).
export function getApi(): Api {
  instance ??=
    env.NEXT_PUBLIC_API_MODE === "live" ? createLiveApi(env.NEXT_PUBLIC_API_URL) : createMockApi();
  return instance;
}

export { ApiError } from "./types";
export type { Api } from "./types";
