import type { z } from "zod";
import {
  BillSchema,
  BillsSchema,
  DashboardSchema,
  HomeSchema,
  type BillInput,
} from "./schemas";
import { ApiError, type Api } from "./types";

type FetchLike = typeof fetch;

function errorDetail(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const { detail } = body as { detail: unknown };
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((d) => (d && typeof d === "object" && "msg" in d ? String(d.msg) : ""))
        .filter(Boolean)
        .join("; ");
    }
  }
  return fallback;
}

export function createLiveApi(baseUrl: string, fetchImpl: FetchLike = fetch): Api {
  const root = `${baseUrl.replace(/\/+$/, "")}/api/v1`;

  async function send(path: string, init?: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetchImpl(`${root}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", ...init?.headers },
      });
    } catch {
      throw new ApiError(0, "No se pudo conectar con la API");
    }
    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = undefined;
      }
      throw new ApiError(res.status, errorDetail(body, res.statusText || "Error de la API"));
    }
    return res;
  }

  async function request<S extends z.ZodTypeAny>(
    path: string,
    schema: S,
    init?: RequestInit,
  ): Promise<z.output<S>> {
    const res = await send(path, init);
    return schema.parse(await res.json());
  }

  const body = (input: BillInput) => JSON.stringify({ ...input, source: "manual" });

  return {
    listHomes: () => request("/homes", HomeSchema.array()),
    listBills: (homeId) => request(`/homes/${homeId}/bills`, BillsSchema),
    getBill: (homeId, billId) => request(`/homes/${homeId}/bills/${billId}`, BillSchema),
    createBill: (homeId, input) =>
      request(`/homes/${homeId}/bills`, BillSchema, { method: "POST", body: body(input) }),
    updateBill: (homeId, billId, input) =>
      request(`/homes/${homeId}/bills/${billId}`, BillSchema, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    deleteBill: async (homeId, billId) => {
      await send(`/homes/${homeId}/bills/${billId}`, { method: "DELETE" });
    },
    getDashboard: (homeId) => request(`/homes/${homeId}/dashboard`, DashboardSchema),
  };
}
