import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ScopeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    name: str
    description: str


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    description: str
    scopes: list[str]


class MyAccessOut(BaseModel):
    """What the caller, specifically, can do right now. Never trust a token's embedded claims
    for this — it is always recomputed from the DB (see app.services.admin.effective_scopes)."""
    user_id: uuid.UUID
    email: str
    roles: list[str]
    scopes: list[str]


_UNSAFE_REASON = re.compile(
    r"[\x00-\x1f\x7f]|@|https?://|\b(?:bearer|token|cookie|password|secret|clave|authorization)\b|\d{7,}",
    re.IGNORECASE)


def _reason(value: str) -> str:
    cleaned = value.strip()
    if not cleaned or _UNSAFE_REASON.search(cleaned):
        raise ValueError("Motivo no válido; use solo términos operativos sin datos personales")
    return cleaned


class RoleAssignmentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: uuid.UUID
    role_name: str = Field(min_length=1, max_length=32)
    reason: str = Field(min_length=1, max_length=500)
    expires_at: datetime | None = None

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        return _reason(value)


class RoleAssignmentRevoke(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, value: str) -> str:
        return _reason(value)


class RoleAssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    user_id: uuid.UUID
    role_name: str
    assigned_by_user_id: uuid.UUID | None
    reason: str
    granted_at: datetime
    expires_at: datetime | None
    revoked_at: datetime | None
    revoked_by_user_id: uuid.UUID | None
    revoke_reason: str | None
    status: str


class OcrOperationReason(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: str = Field(min_length=1, max_length=500)

    @field_validator("reason")
    @classmethod
    def safe_reason(cls, value: str) -> str:
        return _reason(value)


class AdminOcrJobOut(BaseModel):
    id: int
    document_id: uuid.UUID
    status: str
    attempts: int
    max_attempts: int
    run_at: datetime
    created_at: datetime
    finished_at: datetime | None
    error_code: str | None


class AdminOcrHistoryOut(BaseModel):
    action: str
    result: str
    reason: str | None
    created_at: datetime


class AdminOcrJobDetailOut(AdminOcrJobOut):
    """Solo metadatos: el borrador OCR, el texto y el error crudo nunca salen por esta vía."""
    generation: int
    started_at: datetime | None
    engine: str | None
    method: str | None
    pages_read: int | None
    pages_total: int | None
    document_kind: str
    document_content_type: str
    document_size_bytes: int
    uploaded_via: str
    attached_to_bill: bool
    history: list[AdminOcrHistoryOut]


class AdminOcrJobsPage(BaseModel):
    items: list[AdminOcrJobOut]
    total: int
    limit: int
    offset: int


class AuditEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    actor_user_id: uuid.UUID | None
    action: str
    resource: str
    scope_used: str | None
    reason: str | None
    result: str
    request_id: str | None
    created_at: datetime


class RoleAssignmentsPage(BaseModel):
    items: list[RoleAssignmentOut]
    total: int
    limit: int
    offset: int


class AuditEventsPage(BaseModel):
    items: list[AuditEventOut]
    total: int
    limit: int
    offset: int


class OverviewUsers(BaseModel):
    total: int
    verified: int
    new_recent: int
    active_sessions: int


class OverviewJobs(BaseModel):
    queued: int
    running: int
    dead: int
    oldest_wait_minutes: int
    last_finished_at: datetime | None
    worker_state: Literal["ok", "stalled"]  # INFERIDO: no hay latido del worker
    ocr_queued: int
    ocr_running: int
    ocr_dead: int


class OverviewCopilot(BaseModel):
    provider: Literal["disabled", "anthropic", "fake"]
    messages_today: int
    tokens_today: int
    people_today: int


class OverviewHealth(BaseModel):
    database: Literal["ok"]
    storage: str
    email: str
    error_tracking: Literal["configured", "not_configured"]
    environment: str


class TrendPoint(BaseModel):
    day: date
    value: int


class OverviewTrends(BaseModel):
    new_users: list[TrendPoint]
    new_bills: list[TrendPoint]
    copilot_messages: list[TrendPoint]


class AdminOverviewOut(BaseModel):
    """Solo agregados: ningún correo, vivienda ni documento de ninguna persona."""
    generated_at: datetime
    window_days: int
    users: OverviewUsers
    homes: dict[str, int]
    bills: dict[str, int]
    alerts: dict[str, int]
    outages: dict[str, int]
    jobs: OverviewJobs
    copilot: OverviewCopilot
    health: OverviewHealth
    trends: OverviewTrends


class AdminUserOut(BaseModel):
    """Solo lectura. Sin contraseña, hash, tokens ni documentos; las viviendas son un conteo, no una lista."""
    id: uuid.UUID
    email: str
    email_verified: bool
    active: bool
    created_at: datetime
    active_sessions: int
    homes: int
    admin_roles: list[str]


class AdminUserDetailOut(AdminUserOut):
    role: str
    terms_version: str | None
    terms_accepted_at: datetime | None


class AdminUsersPage(BaseModel):
    items: list[AdminUserOut]
    total: int
    limit: int
    offset: int


class AdminHomeOut(BaseModel):
    """ERD-ADM-HOMES-WEB, solo lectura. Sin nombre, dirección, ciudad, sector ni identidad de miembros: solo identificadores y conteos."""
    id: uuid.UUID
    code: str | None
    distributor: str
    province: str | None
    created_at: datetime
    members: int
    bills: int
    last_bill_end: date | None
    open_claims: int
    unread_alerts: int


class AdminHomeDetailOut(AdminHomeOut):
    user_type: str | None
    occupants: int | None
    has_ac: bool | None
    has_water_heater: bool | None
    has_pool: bool | None
    has_solar: bool | None
    has_inverter: bool | None
    owners: int
    pending_invitations: int
    first_bill_start: date | None
    readings: int
    equipment: int
    documents: int
    claims_total: int
    outages: int


class AdminHomesPage(BaseModel):
    items: list[AdminHomeOut]
    total: int
    limit: int
    offset: int


class AdminBillsSummary(BaseModel):
    """ERD-ADM-BILLS-WEB: solo conteos de todas las viviendas; ningún importe ni identificador."""
    days: int
    total: int
    recent: int
    homes_with_bills: int
    manual: int
    seed: int
    with_document: int
    with_readings: int
    with_due_date: int
    paid: int
    zero_kwh: int
    zero_amount: int
    ocr_pending: int
    ocr_failed: int
    ocr_done: int


class AdminBillOut(BaseModel):
    id: uuid.UUID
    period_start: date
    period_end: date
    days: int
    kwh: Decimal
    amount_dop: Decimal
    source: str
    due_date: date | None
    paid: bool
    has_readings: bool
    has_document: bool
    ocr_status: str | None
    created_at: datetime


class AdminHomeBillsPage(BaseModel):
    items: list[AdminBillOut]
    total: int
    limit: int
    offset: int
