import { describe, expect, it } from "vitest";
import { buildJobsQuery, kindAttention, statusLabel, worstAttention, type JobKindRow } from "./jobs";

const row: JobKindRow = { kind: "ocr.process", queued: 0, running: 0, dead: 0, succeeded_24h: 5, dead_24h: 0, cancelled_24h: 0, overdue: 0, oldest_wait_minutes: 0, last_finished_at: null, last_success_at: null };

describe("background-job attention rules", () => {
  it("a quiet kind is ok", () => expect(kindAttention(row)).toEqual({ level: "ok", reasons: [] }));
  it("recent dead jobs ask for attention and say how many", () => {
    const a = kindAttention({ ...row, dead_24h: 1 });
    expect(a.level).toBe("warning");
    expect(a.reasons).toEqual(["1 muerto en 24 h"]);
    expect(kindAttention({ ...row, dead_24h: 3 }).reasons[0]).toBe("3 muertos en 24 h");
  });
  it("overdue work with nothing running means the worker is probably stopped", () => {
    const stalled = kindAttention({ ...row, overdue: 2, oldest_wait_minutes: 45 });
    expect(stalled.level).toBe("critical");
    expect(stalled.reasons[0]).toContain("45 min");
    expect(kindAttention({ ...row, overdue: 2, oldest_wait_minutes: 45, running: 1 }).level).toBe("warning");
  });
  it("old dead jobs (not in the last 24 h) do not raise a flag by themselves", () => {
    expect(kindAttention({ ...row, dead: 4, dead_24h: 0 }).level).toBe("ok");
  });
  it("worst picks the most serious kind", () => {
    expect(worstAttention([row])).toBe("ok");
    expect(worstAttention([row, { ...row, dead_24h: 1 }])).toBe("warning");
    expect(worstAttention([{ ...row, dead_24h: 1 }, { ...row, overdue: 1 }])).toBe("critical");
    expect(worstAttention([])).toBe("ok");
  });
  it("builds a bounded query and ignores an invalid kind", () => {
    expect(buildJobsQuery("ocr.process", "dead", 25)).toBe("?kind=ocr.process&status=dead&limit=25&offset=25");
    expect(buildJobsQuery("Mal Tipo!", "", -3)).toBe("?limit=25&offset=0");
  });
  it("labels statuses in Spanish and keeps unknown ones visible", () => {
    expect(statusLabel("dead")).toBe("Muertos (sin reintentos)");
    expect(statusLabel("raro")).toBe("raro");
  });
});
