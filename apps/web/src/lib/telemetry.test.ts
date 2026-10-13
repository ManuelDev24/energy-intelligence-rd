import { beforeEach, describe, expect, it, vi } from "vitest";

const init = vi.fn();
const capture = vi.fn();
vi.mock("@sentry/browser", () => ({
  init: (o: unknown) => init(o),
  captureException: (e: unknown) => capture(e),
  globalHandlersIntegration: () => ({ name: "GlobalHandlers" }),
  dedupeIntegration: () => ({ name: "Dedupe" }),
}));

import { initTelemetry, reportError, resetTelemetryForTests, telemetryOptions } from "./telemetry";

const DSN = "https://publickey@o1.ingest.sentry.io/1";

beforeEach(() => {
  init.mockClear();
  capture.mockClear();
  resetTelemetryForTests();
});

describe("telemetryOptions", () => {
  it("sin DSN o con un DSN inválido no hay telemetría", () => {
    expect(telemetryOptions({})).toBeNull();
    expect(telemetryOptions({ dsn: "" })).toBeNull();
    expect(telemetryOptions({ dsn: "no es un dsn" })).toBeNull();
    expect(telemetryOptions({ dsn: "http://k@evil.example.com/1", nodeEnv: "development" })).toBeNull();
  });
  it("en producción exige https, también hacia loopback", () => {
    expect(telemetryOptions({ dsn: "http://k@127.0.0.1:9000/1", nodeEnv: "production" })).toBeNull();
    expect(telemetryOptions({ dsn: DSN, nodeEnv: "production", environment: "production" })).toMatchObject({ dsn: DSN, environment: "production" });
  });
  it("en desarrollo acepta http hacia loopback (servidor de prueba local)", () => {
    expect(telemetryOptions({ dsn: "http://k@127.0.0.1:9000/1", nodeEnv: "development" })?.dsn).toBe("http://k@127.0.0.1:9000/1");
  });
});

describe("initTelemetry", () => {
  it("no inicia el SDK sin DSN y reportError no hace nada", () => {
    expect(initTelemetry({})).toBe(false);
    reportError(new Error("x"));
    expect(init).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it("inicia una sola vez, sin datos personales, sin migas, sin trazas y con solo los manejadores globales", () => {
    expect(initTelemetry({ dsn: DSN, nodeEnv: "production" })).toBe(true);
    expect(initTelemetry({ dsn: DSN, nodeEnv: "production" })).toBe(true);
    expect(init).toHaveBeenCalledTimes(1);
    const options = init.mock.calls[0][0];
    expect(options).toMatchObject({ dsn: DSN, sendDefaultPii: false, defaultIntegrations: false, tracesSampleRate: 0, maxBreadcrumbs: 0 });
    expect(options.integrations.map((i: { name: string }) => i.name)).toEqual(["GlobalHandlers", "Dedupe"]);
    expect(options.beforeBreadcrumb({ message: "click en ana@example.com" })).toBeNull();
  });

  it("todo evento pasa por el filtro de datos personales antes de salir", () => {
    initTelemetry({ dsn: DSN, nodeEnv: "production" });
    const out = init.mock.calls[0][0].beforeSend({
      user: { email: "a@b.co" },
      request: { url: "https://x.com/a?token=zzz", cookies: { sid: "1" } },
      exception: { values: [{ value: "falló para ana@example.com" }] },
    });
    expect(out.user).toBeUndefined();
    expect(out.request).toEqual({ url: "https://x.com/a" });
    expect(out.exception.values[0].value).toBe("falló para [Filtered]");
  });

  it("reportError envía la excepción cuando la telemetría está activa", () => {
    initTelemetry({ dsn: DSN, nodeEnv: "production" });
    const error = new Error("boom");
    reportError(error);
    expect(capture).toHaveBeenCalledWith(error);
  });
});
