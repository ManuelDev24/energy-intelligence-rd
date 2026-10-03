import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("usa el valor por defecto cuando no hay variable", () => {
    expect(parseEnv({}).NEXT_PUBLIC_API_URL).toBe("http://localhost:8000");
  });

  it("acepta una URL válida", () => {
    expect(
      parseEnv({ NEXT_PUBLIC_API_URL: "https://api.example.test" }).NEXT_PUBLIC_API_URL,
    ).toBe("https://api.example.test");
  });

  it("rechaza una URL inválida", () => {
    expect(() => parseEnv({ NEXT_PUBLIC_API_URL: "no-es-url" })).toThrow();
  });
});
