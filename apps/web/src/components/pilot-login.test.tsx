import { ApiError } from "@energyrd/api-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PilotLogin } from "./pilot-login";

// Hallazgo del smoke ERD-WEB-QUALITY (PR #17): sin API, el acceso demo mostraba el error sin "Reintentar".
const refetch = vi.fn();
vi.mock("@/lib/api/hooks", () => ({
  useHomes: () => ({ isLoading: false, data: undefined, error: new ApiError(0, "SERVER"), refetch }),
}));
vi.mock("@/lib/session", () => ({ useSession: () => ({ signIn: vi.fn(), homeId: null }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));

it("si no cargan las viviendas, ofrece Reintentar y vuelve a pedirlas", () => {
  render(<PilotLogin />);
  fireEvent.click(screen.getByRole("button", { name: /Reintentar/ }));
  expect(refetch).toHaveBeenCalledTimes(1);
});
