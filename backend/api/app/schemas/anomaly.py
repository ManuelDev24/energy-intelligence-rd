import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict


class AnomalyRecord(BaseModel):
    """Un hallazgo persistido del motor de anomalías. `baseline_kwh` está expresado sobre los MISMOS días que
    `observed_kwh` (línea base × días cubiertos), así que `delta_pct` se lee directamente. `delta_pct` es nulo en las
    anomalías nocturnas (ahí `baseline_kwh` es lo que habría marcado el medidor al ritmo promedio)."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    home_id: uuid.UUID
    bill_id: uuid.UUID | None
    kind: Literal["increase", "drop", "peak", "night"]
    source: Literal["readings", "bills"]
    granularity: Literal["day", "month", "billing"]
    severity: Literal["info", "warning", "critical"]
    confidence: Literal["low", "medium", "high"]
    status: Literal["open", "acknowledged", "dismissed", "resolved"]
    observed_kwh: Decimal
    baseline_kwh: Decimal
    delta_pct: Decimal | None
    days: Decimal
    period_start: date
    period_end: date
    explanation: str
    detected_at: datetime
    last_seen_at: datetime


class AnomalyStatusIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["open", "acknowledged", "dismissed"]


class ScanQueuedOut(BaseModel):
    status: Literal["queued"]
