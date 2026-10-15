import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from app.schemas.tariff import TariffOut
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


class AdminTariffCoverage(BaseModel):
    """ERD-ADM-TARIFFS-WEB: ¿hay una tarifa vigente para esta distribuidora hoy y hasta cuándo? (datos públicos de la SIE)."""
    distributor: str
    tariff_code: str
    status: Literal['current', 'expiring', 'future_only', 'missing']
    current_id: uuid.UUID | None
    effective_from: date | None
    effective_to: date | None
    days_left: int | None          # días hasta el fin de la versión vigente (None = sin fecha de fin o sin versión vigente)
    next_from: date | None         # inicio de la versión siguiente (cubre el fin de la vigente o es la primera futura)
    last_ended: date | None        # fin de la última versión vencida (cuando no hay ninguna vigente)


class AdminTariffVersionOut(TariffOut):
    state: Literal['current', 'past', 'future']


class AdminTariffsOut(BaseModel):
    today: date
    warn_days: int
    coverage: list[AdminTariffCoverage]
    versions: list[AdminTariffVersionOut]


JobStatus = Literal['queued', 'running', 'succeeded', 'dead', 'cancelled']


class AdminJobKindOut(BaseModel):
    """ERD-ADM-OPS-WEB: una fila por tipo de trabajo. Solo números y fechas: nunca cargas útiles ni mensajes de error."""
    kind: str
    queued: int
    running: int
    dead: int
    succeeded_24h: int
    dead_24h: int
    cancelled_24h: int
    overdue: int                   # en cola y vencidos hace más de OVERDUE_MINUTES
    oldest_wait_minutes: int       # el más antiguo en cola y ya vencido (0 = ninguno)
    last_finished_at: datetime | None
    last_success_at: datetime | None


class AdminJobsSummaryOut(BaseModel):
    generated_at: datetime
    overdue_minutes: int
    kinds: list[AdminJobKindOut]


class AdminJobOut(BaseModel):
    id: int
    kind: str
    status: JobStatus
    attempts: int
    max_attempts: int
    run_at: datetime
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    has_error: bool                # el texto del error NO se expone (puede contener datos personales)
    overdue: bool


class AdminJobsPage(BaseModel):
    items: list[AdminJobOut]
    total: int
    limit: int
    offset: int


class AdminAiModelRow(BaseModel):
    model: str
    messages: int
    input_tokens: int
    output_tokens: int


class AdminAiToolRow(BaseModel):
    name: str
    count: int


class AdminAiDayRow(BaseModel):
    day: str
    messages: int
    tokens: int
    people: int


class AdminAiPersonRow(BaseModel):
    """Solo el identificador (seudónimo) de la persona: ni correo, ni vivienda, ni contenido."""
    subject: str
    messages: int
    tokens: int
    days_active: int


class AdminAiCost(BaseModel):
    """Estimación: tokens × precio configurado. Sin precios configurados no se estima nada (`configured=False`)."""
    configured: bool
    input_usd: Decimal | None
    output_usd: Decimal | None
    total_usd: Decimal | None


class AdminAiLimits(BaseModel):
    provider: Literal['disabled', 'anthropic', 'fake']
    model: str
    daily_messages_per_user: int
    daily_tokens_per_user: int
    max_conversations_per_user: int


class AdminAiUsageOut(BaseModel):
    """ERD-AI-ADMIN-WEB: agregados del Copilot. Nunca texto de conversaciones, títulos, fuentes ni la vivienda."""
    days: int
    assistant_messages: int
    by_status: dict[str, int]
    input_tokens: int
    output_tokens: int
    latency_p50_ms: int | None
    latency_p95_ms: int | None
    feedback_up: int
    feedback_down: int
    conversations: int
    by_model: list[AdminAiModelRow]
    tools: list[AdminAiToolRow]
    by_day: list[AdminAiDayRow]
    top_people: list[AdminAiPersonRow]
    cost: AdminAiCost
    limits: AdminAiLimits
