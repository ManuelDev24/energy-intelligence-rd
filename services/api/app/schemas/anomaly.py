import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel


class AnomalyRecord(BaseModel):
    home_id: uuid.UUID
    granularity: Literal["day", "month"]
    severity: Literal["warning", "critical"]
    observed_kwh: Decimal
    baseline_kwh: Decimal
    delta_pct: Decimal
    period_start: date
    period_end: date
    explanation: str
