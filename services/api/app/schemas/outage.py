import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal, Self

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator

OutageCause = Literal["unknown", "utility_fault", "scheduled", "weather", "home_fault"]
# Margen por relojes desfasados; una interrupción futura no se registra (no se inventan datos).
FUTURE_TOLERANCE = timedelta(minutes=5)
MAX_DURATION = timedelta(days=30)


class OutageIn(BaseModel):
    """Reemplazo completo (PUT/POST). `ended_at` nulo = todavía sin luz."""
    model_config = ConfigDict(extra="forbid")

    started_at: AwareDatetime
    ended_at: AwareDatetime | None = None
    cause: OutageCause = "unknown"
    note: str | None = Field(default=None, max_length=255)

    @field_validator("note")
    @classmethod
    def _blank_is_none(cls, value: str | None) -> str | None:
        value = value.strip() if value is not None else None
        return value or None

    @model_validator(mode="after")
    def _consistent(self) -> Self:
        limit = datetime.now(timezone.utc) + FUTURE_TOLERANCE
        if self.started_at > limit:
            raise ValueError("started_at cannot be in the future")
        if self.ended_at is not None:
            if self.ended_at > limit:
                raise ValueError("ended_at cannot be in the future")
            if self.ended_at <= self.started_at:
                raise ValueError("ended_at must be after started_at")
            if self.ended_at - self.started_at > MAX_DURATION:
                raise ValueError("an outage cannot last more than 30 days")
        return self


class OutageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    home_id: uuid.UUID
    started_at: datetime
    ended_at: datetime | None
    cause: OutageCause
    note: str | None
    source: Literal["manual"]
    created_at: datetime
    updated_at: datetime

    @field_validator("started_at", "ended_at", "created_at", "updated_at")
    @classmethod
    def _utc(cls, value: datetime | None) -> datetime | None:
        return None if value is None else value.astimezone(timezone.utc)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def ongoing(self) -> bool:
        return self.ended_at is None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def duration_minutes(self) -> int | None:
        """Minutos de la interrupción terminada; null mientras siga abierta (la duración aún no existe)."""
        return None if self.ended_at is None else int((self.ended_at - self.started_at).total_seconds() // 60)


class OutageMonth(BaseModel):
    """Totales de un mes calendario (America/Santo_Domingo). Cada interrupción se cuenta entera en el mes en que EMPEZÓ."""
    month: str                       # AAAA-MM
    count: int
    total_minutes: int
    longest_minutes: int
    average_minutes: int | None      # null si el mes no tiene interrupciones
    ongoing: int                     # abiertas que empezaron ese mes: su duración corre hasta ahora y está incluida arriba


class OutageTotals(BaseModel):
    count: int
    total_minutes: int
    longest_minutes: int
    average_minutes: int | None
    ongoing: int


class OutageSummaryOut(BaseModel):
    home_id: uuid.UUID
    timezone: str
    from_month: str
    to_month: str
    months: list[OutageMonth]
    totals: OutageTotals
    note: str
