import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("usa los valores por defecto cuando no hay variables", () => {
    const env = parseEnv({});
    expect(env.NEXT_PUBLIC_API_URL).toBe("http://localhost:8000");
    expect(env.NEXT_PUBLIC_API_MODE).toBe("mock");
  });

  it("acepta una URL válida y el modo live", () => {
    const env = parseEnv({
      NEXT_PUBLIC_API_URL: "https://api.example.test",
      NEXT_PUBLIC_API_MODE: "live",
    });
    expect(env.NEXT_PUBLIC_API_URL).toBe("https://api.example.test");
    expect(env.NEXT_PUBLIC_API_MODE).toBe("live");
  });

  it("rechaza una URL inválida", () => {
    expect(() => parseEnv({ NEXT_PUBLIC_API_URL: "no-es-url" })).toThrow();
  });

  it("rechaza un modo desconocido", () => {
    expect(() => parseEnv({ NEXT_PUBLIC_API_MODE: "demo" })).toThrow();
  });
});
