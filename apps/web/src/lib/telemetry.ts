// ERD-OBS-01 (web): Sentry en el navegador, INACTIVO sin NEXT_PUBLIC_SENTRY_DSN. Todo evento pasa por el mismo filtro de datos
// personales que la API (`@energyrd/core`). Sin migas de pan (llevan URLs y texto de la página), sin sesiones ni repetición, sin
// trazas: solo errores no capturados y los que la app reporte a propósito. El BFF (servidor) NO envía nada: ve cookies y tokens.
import { scrubSentryEvent, validDsn } from "@energyrd/core";
import * as Sentry from "@sentry/browser";

export interface TelemetryEnv {
  dsn?: string;
  environment?: string;
  release?: string;
  nodeEnv?: string;
}

export interface TelemetryOptions {
  dsn: string;
  environment: string;
  release?: string;
}

/** Opciones si hay DSN válido; `null` si no (entonces no se inicia nada). */
export function telemetryOptions(env: TelemetryEnv): TelemetryOptions | null {
  const dsn = validDsn(env.dsn, env.nodeEnv !== "production");
  if (!dsn) return null;
  return { dsn, environment: env.environment || env.nodeEnv || "development", release: env.release || undefined };
}

let started = false;

export function initTelemetry(env: TelemetryEnv = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
  nodeEnv: process.env.NODE_ENV,
}): boolean {
  if (started) return true;
  const options = telemetryOptions(env);
  if (!options) return false;
  Sentry.init({
    ...options,
    sendDefaultPii: false,
    defaultIntegrations: false,
    integrations: [Sentry.globalHandlersIntegration(), Sentry.dedupeIntegration()],
    tracesSampleRate: 0,
    maxBreadcrumbs: 0,
    beforeBreadcrumb: () => null,
    beforeSend: (event) => scrubSentryEvent(event as unknown as Record<string, unknown>) as unknown as typeof event,
  });
  started = true;
  return true;
}

/** Reporta un error a propósito (p. ej. el que captura la pantalla de error). No-op si la telemetría está apagada. */
export function reportError(error: unknown): void {
  if (started) Sentry.captureException(error);
}

export function resetTelemetryForTests(): void {
  started = false;
}
