import re
import uuid
from datetime import datetime

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
