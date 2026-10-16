import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { AdminUserRequestRow } from "@/components/AdminUserRequestRow";
import type { AdminUserRequest } from "@/lib/user-requests";

const item: AdminUserRequest = {
  id: "00000000-0000-4000-8000-000000000001",
  target_user_id: "00000000-0000-4000-8000-000000000002",
  kind: "export",
  status: "pending",
  reason: "solicitud registrada",
  resolution_reason: null,
  created_at: "2026-10-15T10:00:00Z",
  updated_at: "2026-10-15T10:00:00Z",
  resolved_at: null,
};

function renderRow(canManageRequests: boolean) {
  return render(
    <table><tbody><AdminUserRequestRow item={item} canViewUser={false} canManageRequests={canManageRequests} onChanged={async () => {}} /></tbody></table>,
  );
}

describe("solicitudes de datos", () => {
  it("keeps the queue read-only without the manage scope", () => {
    renderRow(false);
    expect(screen.queryByRole("form", { name: /tramitar solicitud/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Solo lectura/)).toBeInTheDocument();
  });

  it("shows transitions to an operator with the manage scope", () => {
    renderRow(true);
    expect(screen.getByRole("form", { name: /tramitar solicitud/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Iniciar revisión" })).toBeInTheDocument();
  });
});
