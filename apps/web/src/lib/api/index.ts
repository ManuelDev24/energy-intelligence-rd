import { env } from "@/lib/env";
import { createLiveApi } from "./live";
import type { Api } from "./types";

let instance: Api | undefined;

// La web siempre habla con la API real. Los mocks viven solo en src/test.
export function getApi(): Api {
  instance ??= createLiveApi(env.NEXT_PUBLIC_API_URL);
  return instance;
}

export { ApiError } from "./types";
export type { Api } from "./types";
