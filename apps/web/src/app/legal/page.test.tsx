import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import LegalPage from "./page";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it("shows a draft legal notice with real version numbers, never final text", async () => {
  vi.stubEnv("NEXT_PUBLIC_AUTH_ENABLED", "true");
  vi.resetModules();
  const { default: Page } = await import("./page");
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ terms_version: "2026-10-draft", privacy_version: "2026-10-draft", status: "draft" })));
  render(<Page />);
  expect(await screen.findByText(/versión de términos: 2026-10-draft/i)).toBeInTheDocument();
  expect(screen.getByText(/borrador/i)).toBeInTheDocument();
  expect(screen.queryByText(/términos y condiciones finales/i)).not.toBeInTheDocument();
});

it("shows an unavailable notice when auth is disabled (pilot mode)", () => {
  render(<LegalPage />);
  expect(screen.getByText(/no disponible en el piloto/i)).toBeInTheDocument();
});
