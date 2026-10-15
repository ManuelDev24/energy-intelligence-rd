import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from app.schemas.dashboard import Metric


class ReportHome(BaseModel):
    id: uuid.UUID                     # = home_id; los clientes comprueban que el informe es de la vivienda pedida
    name: str
    distributor: str
    province: str | None
    municipality: str | None


class ReportPeriod(BaseModel):
    period_from: date
    period_to: date
    days: int


class ReportBill(BaseModel):
    bill_id: uuid.UUID
    period_start: date
    period_end: date
    days: int
    kwh: Metric                       # REAL
    amount_dop: Metric                # REAL
    avg_price_per_kwh: Metric | None  # ESTIMATED: RD$ / kWh (incluye cargos fijos e impuestos)


class ReportTotals(BaseModel):
    bills_count: int
    kwh: Metric | None                # REAL: suma de las facturas listadas
    amount_dop: Metric | None         # REAL
    avg_price_per_kwh: Metric | None  # ESTIMATED
    avg_kwh_per_bill: Metric | None   # ESTIMATED


class ReportComparison(BaseModel):
    previous_from: date
    previous_to: date
    previous_kwh: Metric              # REAL
    previous_amount_dop: Metric       # REAL
    kwh_pct: Metric | None            # ESTIMATED: variación % frente al período anterior (null si el anterior es 0)
    amount_pct: Metric | None


class ReportEquipment(BaseModel):
    name: str
    room: str | None
    monthly_kwh: Metric               # ESTIMATED
    share_pct: Metric                 # ESTIMATED


class ReportRecommendation(BaseModel):
    title: str
    action: str
    savings_kwh_month: Metric | None  # ESTIMATED
    difficulty: Literal["easy", "medium", "hard"]
    impact: Literal["low", "medium", "high"] | None


class ReportGoal(BaseModel):
    monthly_kwh: Decimal | None
    monthly_amount_rd: Decimal | None


class ReportSource(BaseModel):
    label: str
    quality: Literal["REAL", "ESTIMATED", "PROJECTED"]


class EnergyReportOut(BaseModel):
    """Informe energético de una vivienda en un período. Cada cifra lleva su calidad; nada se inventa: lo que falta viene `null`/vacío
    y se explica en `notes`. No incluye dirección, contrato ni datos de otras personas."""
    home_id: uuid.UUID
    home: ReportHome
    period: ReportPeriod
    generated_at: datetime
    bills: list[ReportBill]
    totals: ReportTotals
    peak_bill: ReportBill | None      # la factura con más kWh del período
    comparison: ReportComparison | None
    equipment: list[ReportEquipment]
    recommendations: list[ReportRecommendation]
    goal: ReportGoal | None
    sources: list[ReportSource]
    notes: list[str]
