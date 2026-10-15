import { describe, expect, it } from "vitest";
import { barWidth, isPersonId, ms, nfs, percent, problemRate, satisfaction, shortSubject, usd, type AiUsage } from "./ai";

const base: AiUsage = {
  days: 14, assistant_messages: 10, by_status: { complete: 8, error: 1, refused: 1 }, input_tokens: 0, output_tokens: 0, latency_p50_ms: 1200, latency_p95_ms: 3400,
  feedback_up: 3, feedback_down: 1, conversations: 2, by_model: [], tools: [], by_day: [], top_people: [],
  cost: { configured: false, input_usd: null, output_usd: null, total_usd: null },
  limits: { provider: "disabled", model: "x", daily_messages_per_user: 40, daily_tokens_per_user: 400000, max_conversations_per_user: 200 },
};

describe("AI supervision rules", () => {
  it("never invents rates without data", () => {
    expect(percent(0, 0)).toBe("—");
    expect(problemRate({ ...base, assistant_messages: 0, by_status: {} })).toBe("—");
    expect(satisfaction({ ...base, feedback_up: 0, feedback_down: 0 })).toBe("—");
  });
  it("computes problem rate (error + refused) and satisfaction", () => {
    expect(problemRate(base)).toBe("20 %");
    expect(satisfaction(base)).toBe("75 %");
  });
  it("formats latency, money and counts without depending on the system locale", () => {
    expect(ms(null)).toBe("—");
    expect(ms(850)).toBe("850 ms");
    expect(ms(3400)).toBe("3,4 s");
    expect(usd(null)).toBe("—");
    expect(usd("10.5")).toBe("US$ 10,50");
    expect(nfs(1234567)).toBe("1.234.567");
  });
  it("shows a short pseudonym and only links real person ids", () => {
    expect(shortSubject("11111111-1111-4111-8111-111111111111")).toBe("11111111…");
    expect(shortSubject("pilot")).toBe("pilot");
    expect(isPersonId("pilot")).toBe(false);
    expect(isPersonId("11111111-1111-4111-8111-111111111111")).toBe(true);
  });
  it("scales daily bars to the maximum with a visible minimum", () => {
    expect(barWidth(50, 100)).toBe(50);
    expect(barWidth(0, 0)).toBe(0);
    expect(barWidth(1, 1000)).toBe(2);
  });
});
