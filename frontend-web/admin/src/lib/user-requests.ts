export type UserRequestKind = "export" | "deletion";
export type UserRequestStatus = "pending" | "in_progress" | "completed" | "rejected";
export type AdminUserRequest = {
  id: string;
  target_user_id: string;
  kind: UserRequestKind;
  status: UserRequestStatus;
  reason: string;
  resolution_reason: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};
export type AdminUserRequestsPage = { items: AdminUserRequest[]; total: number; limit: number; offset: number };
export type AdminCloseSessionsOut = { user_id: string; closed_sessions: number };
export type AdminUserDeactivationOut = { user_id: string; active: boolean; closed_sessions: number };

const KIND_LABELS: Record<UserRequestKind, string> = {
  export: "Exportación",
  deletion: "Borrado",
};
const STATUS_LABELS: Record<UserRequestStatus, string> = {
  pending: "Pendiente",
  in_progress: "En revisión",
  completed: "Atendida",
  rejected: "Rechazada",
};
const NEXT_STATUSES: Record<UserRequestStatus, UserRequestStatus[]> = {
  pending: ["in_progress", "rejected"],
  in_progress: ["completed", "rejected"],
  completed: [],
  rejected: [],
};

export const requestKindLabel = (kind: UserRequestKind) => KIND_LABELS[kind];
export const requestStatusLabel = (status: UserRequestStatus) => STATUS_LABELS[status];
export const allowedNextStatuses = (status: UserRequestStatus) => NEXT_STATUSES[status];
