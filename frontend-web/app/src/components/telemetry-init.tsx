"use client";

import { useEffect } from "react";
import { initTelemetry } from "@/lib/telemetry";

/** Inicia la telemetría una vez en el navegador. No pinta nada. */
export function TelemetryInit() {
  useEffect(() => {
    initTelemetry();
  }, []);
  return null;
}
