import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

Quality = Literal["REAL", "ESTIMATED", "PROJECTED"]
Severity = Literal["warning", "critical"]


class Metric(BaseModel):
    value: Decimal
    unit: str
    quality: Quality


class LatestBill(BaseModel):
    bill_id: uuid.UUID
    period_start: date
    period_end: date
    days: int
    kwh: Metric                       # REAL: dato de la factura
    amount_dop: Metric                # REAL: dato de la factura
    avg_daily_kwh: Metric | None      # ESTIMATED: kWh / días (la factura es mensual, no hay medición diaria)
    avg_price_per_kwh: Metric | None  # ESTIMATED: RD$ / kWh (incluye cargos fijos e impuestos)
    source: Literal["manual", "seed"]


class Comparison(BaseModel):
    previous_bill_id: uuid.UUID
    previous_period_start: date
    previous_period_end: date
    kwh_delta: Metric
    kwh_pct: Metric | None            # None si el período base es 0 kWh
    amount_delta: Metric
    amount_pct: Metric | None


class ProjectionOut(BaseModel):
    method: str
    bills_used: int
    kwh: Metric                       # PROJECTED
    amount_dop: Metric                # PROJECTED
    note: str


class AlertOut(BaseModel):
    severity: Severity
    message: str
    basis_period_start: date
    basis_period_end: date


class DataStatus(BaseModel):
    bills_count: int
    data_source: Literal["manual", "seed", "mixed", "none"]
    is_demo: bool                      # True si alguna factura proviene del seed
    resolution: Literal["monthly"] = "monthly"
    hourly_data_available: bool = False
    insufficient_reasons: list[str]


class DashboardHome(BaseModel):
    id: uuid.UUID
    code: str | None
    name: str
    distributor: str


class DashboardOut(BaseModel):
    home: DashboardHome
    latest_bill: LatestBill | None
    comparison: Comparison | None
    projection: ProjectionOut | None
    alert: AlertOut | None
    recommendation: str | None
    data_status: DataStatus
    quality_legend: dict[str, str]
