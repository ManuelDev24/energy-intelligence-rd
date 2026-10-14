import { describe, expect, it } from "vitest";
import { healthRows, sparkPoints, seriesTotal, type Overview } from "./overview";

const base: Overview = {
  generated_at: "2026-10-14T12:00:00Z", window_days: 14,
  users: { total: 3, verified: 2, new_recent: 1, active_sessions: 2 }, homes: { total: 1 }, bills: { total: 4, recent: 2 }, alerts: { unread: 0 }, outages: { recent: 0 },
  jobs: { queued: 0, running: 0, dead: 0, oldest_wait_minutes: 0, last_finished_at: null, worker_state: "ok", ocr_queued: 0, ocr_running: 0, ocr_dead: 0 },
  copilot: { provider: "disabled", messages_today: 0, tokens_today: 0, people_today: 0 },
  health: { database: "ok", storage: "s3", email: "resend", error_tracking: "configured", environment: "production" },
  trends: { new_users: [], new_bills: [], copilot_messages: [] },
};

describe("resumen administrativo", () => {
  it("todo en orden en producción", () => {
    const rows = healthRows(base);
    expect(rows.filter(r => r.status === "warning")).toEqual([]);
    expect(rows.find(r => r.label === "Copilot")).toMatchObject({ value: "Apagado", status: "off" });
  });

  it("avisa de un worker posiblemente detenido, sin afirmarlo como hecho", () => {
    const row = healthRows({ ...base, jobs: { ...base.jobs, worker_state: "stalled", oldest_wait_minutes: 25 } }).find(r => r.label.startsWith("Worker"))!;
    expect(row.status).toBe("warning");
    expect(row.value).toContain("Posiblemente");
    expect(row.hint).toContain("Inferido");
  });

  it("en producción, disco local, sin correo real o sin seguimiento de errores son advertencias; en desarrollo no", () => {
    const risky = { ...base.health, storage: "local", email: "console", error_tracking: "not_configured" as const };
    expect(healthRows({ ...base, health: risky }).filter(r => r.status === "warning")).toHaveLength(3);
    expect(healthRows({ ...base, health: { ...risky, environment: "development" } }).filter(r => r.status === "warning")).toHaveLength(0);
  });

  it("la serie se escala al máximo y queda plana si todo es cero", () => {
    const series = [{ day: "2026-10-12", value: 0 }, { day: "2026-10-13", value: 5 }, { day: "2026-10-14", value: 10 }];
    expect(sparkPoints(series, 100, 22)).toBe("2.0,20.0 50.0,11.0 98.0,2.0");
    expect(sparkPoints(series.map(p => ({ ...p, value: 0 })), 100, 22)).toBe("2.0,20.0 50.0,20.0 98.0,20.0");
    expect(sparkPoints([], 100, 22)).toBe("");
    expect(seriesTotal(series)).toBe(15);
  });
});
