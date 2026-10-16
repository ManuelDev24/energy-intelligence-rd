import { act, render, screen, waitFor } from "@testing-library/react";
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
it("shows offline status without unmounting the authenticated form, then clears it when online returns", () => {
  state.user = { id: "account" }; state.homeId = "own-home";
  const connection = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  try {
    render(<AppShell><input aria-label="Borrador" defaultValue="sin guardar" /></AppShell>);
    expect(screen.queryByText(/Sin conexión/)).not.toBeInTheDocument();
    connection.mockReturnValue(false);
    expect(navigator.onLine).toBe(false);
    act(() => window.dispatchEvent(new window.Event("offline")));
    expect(screen.getByText(/Sin conexión\. Tus formularios siguen disponibles/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Borrador" })).toHaveValue("sin guardar");
    connection.mockReturnValue(true);
    act(() => window.dispatchEvent(new window.Event("online")));
    expect(screen.queryByText(/Sin conexión/)).not.toBeInTheDocument();
  } finally { connection.mockRestore(); }
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
