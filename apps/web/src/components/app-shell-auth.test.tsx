import { render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";
const state = vi.hoisted(() => ({ homeId: "old-home" as string | null, ready: true, authEnabled: true, user: null as null | { id: string } }));
const replace = vi.hoisted(() => vi.fn());
vi.mock("@/lib/session", () => ({ useSession: () => state }));
vi.mock("@/lib/api/hooks", () => ({ useAlerts: () => ({ data: [] }), useHomes: () => ({ data: [] }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => ({ replace }) }));
it("Perfil tiene acceso visible en navegación lateral y cabecera móvil", () => {
  state.user = { id: "account" }; state.homeId = "own-home";
  render(<AppShell><p>PRIVATE</p></AppShell>);
  const links = screen.getAllByRole("link", { name: "Perfil" });
  expect(links).toHaveLength(2);
  links.forEach(link => expect(link).toHaveAttribute("href", "/profile"));
});
it("never renders private children for a logged-out account even with an old home id", async () => {
  state.user = null; state.homeId = "old-home";
  render(<AppShell><p>PRIVATE</p></AppShell>);
  expect(screen.queryByText("PRIVATE")).not.toBeInTheDocument();
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
});
it("sends an authenticated account without a selected home to owned home selection", async () => {
  state.user = { id: "account" }; state.homeId = null;
  render(<AppShell><p>PRIVATE</p></AppShell>);
  expect(screen.queryByText("PRIVATE")).not.toBeInTheDocument();
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/homes"));
});
