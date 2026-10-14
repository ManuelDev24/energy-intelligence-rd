import re
import uuid
from datetime import date, datetime
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
