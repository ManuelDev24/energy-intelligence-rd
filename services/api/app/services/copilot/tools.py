"""ERD-AI-CHAT: herramientas del Energy Copilot. Todas son de SOLO LECTURA y reutilizan los servicios que ya alimentan la web y el
móvil (dashboard, facturas, consumo, equipos, recomendaciones, tarifa, score, apagones, meta): el Copilot nunca calcula por su cuenta
ni escribe datos. Cada resultado lleva la calidad del dato y una lista de fuentes con enlaces INTERNOS que la interfaz puede mostrar.

La entrada viene del modelo y no es de fiar: se valida con Pydantic antes de ejecutar nada (errores → resultado `is_error`)."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Callable, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from sqlalchemy.orm import Session

from app.models import Home
from app.services import bills, consumption, energy_score, equipment, goals, outages, recommendations, tariffs
from app.services.consumption_calc import SANTO_DOMINGO
from app.services.dashboard import build_dashboard
from app.services.errors import ApplicationError

MAX_RESULT_CHARS = 12_000
Quality = Literal["REAL", "ESTIMATED", "PROJECTED", "INFERRED"]


def today_rd() -> date:
    return datetime.now(SANTO_DOMINGO).date()


@dataclass
class Source:
    kind: str
    label: str
    quality: Quality
    href: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {"kind": self.kind, "label": self.label, "quality": self.quality, "href": self.href}


@dataclass
class ToolResult:
    content: str
    sources: list[Source] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    is_error: bool = False


class _NoInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _BillsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    limit: int = Field(6, ge=1, le=12)


class _ConsumptionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    from_date: date
    to_date: date
    granularity: Literal["day", "week", "month"] = "month"

    @model_validator(mode="after")
    def ordered(self) -> "_ConsumptionInput":
        if self.to_date < self.from_date:
            raise ValueError("to_date debe ser igual o posterior a from_date")
        return self


class _CostInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kwh: Decimal = Field(gt=0, le=100_000)


class _OutagesInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    months: int = Field(6, ge=1, le=12)


def _json(value: Any) -> str:
    text = json.dumps(value, ensure_ascii=False, default=str, separators=(",", ":"))
    return text if len(text) <= MAX_RESULT_CHARS else text[:MAX_RESULT_CHARS] + "…(recortado)"


def _metric(m) -> dict | None:
    return None if m is None else {"value": str(m.value), "unit": m.unit, "quality": m.quality}


# ---------- herramientas ----------
def home_overview(db: Session, home: Home, _: _NoInput) -> ToolResult:
    d = build_dashboard(db, home)
    out: dict[str, Any] = {"home": {"name": home.name, "distributor": home.distributor},
                           "data_status": d.data_status.model_dump(mode="json")}
    sources = [Source("dashboard", "Resumen de la vivienda", "REAL", "/dashboard")]
    if d.latest_bill:
        b = d.latest_bill
        out["latest_bill"] = {"period_start": b.period_start, "period_end": b.period_end, "days": b.days, "kwh": _metric(b.kwh),
                              "amount_dop": _metric(b.amount_dop), "avg_daily_kwh": _metric(b.avg_daily_kwh),
                              "avg_price_per_kwh": _metric(b.avg_price_per_kwh)}
        sources.append(Source("bill", f"Factura {b.period_start:%d/%m/%Y}–{b.period_end:%d/%m/%Y}", "REAL", f"/bills/{b.bill_id}"))
    if d.comparison:
        c = d.comparison
        out["vs_previous_bill"] = {"previous_period": [c.previous_period_start, c.previous_period_end], "kwh_delta": _metric(c.kwh_delta),
                                   "kwh_pct": _metric(c.kwh_pct), "amount_delta": _metric(c.amount_delta), "amount_pct": _metric(c.amount_pct)}
        sources.append(Source("bill", f"Factura {c.previous_period_start:%d/%m/%Y}–{c.previous_period_end:%d/%m/%Y}", "REAL",
                              f"/bills/{c.previous_bill_id}"))
    if d.projection:
        p = d.projection
        out["projection"] = {"kwh": _metric(p.kwh), "amount_dop": _metric(p.amount_dop), "method": p.method,
                             "bills_used": p.bills_used, "note": p.note}
        sources.append(Source("projection", "Proyección de la próxima factura", "PROJECTED", "/dashboard"))
    warnings = [] if d.latest_bill else ["La vivienda no tiene facturas registradas."]
    return ToolResult(_json(out), sources, warnings)


def list_bills(db: Session, home: Home, args: _BillsInput) -> ToolResult:
    rows = bills.list_bills(db, home.id, limit=args.limit)
    items = [{"period_start": b.period_start, "period_end": b.period_end, "days": b.days, "kwh": str(b.kwh),
              "amount_dop": str(b.amount_dop), "due_date": b.due_date, "paid": b.paid_at is not None, "quality": "REAL"} for b in rows]
    sources = [Source("bill", f"Factura {b.period_start:%d/%m/%Y}–{b.period_end:%d/%m/%Y}", "REAL", f"/bills/{b.id}") for b in rows]
    return ToolResult(_json({"bills": items, "count": len(items)}), sources,
                      [] if rows else ["La vivienda no tiene facturas registradas."])


def consumption_range(db: Session, home: Home, args: _ConsumptionInput) -> ToolResult:
    c = consumption.build_consumption(db, home.id, args.granularity, args.from_date, args.to_date)
    out = {"from": c.from_date, "to": c.to_date, "granularity": c.granularity, "readings_used": c.readings_used,
           "totals": c.totals.model_dump(mode="json"), "average_daily_kwh": _metric(c.average_daily_kwh),
           "estimated_cost": _metric(c.estimated_cost), "peak_bucket": c.peak_bucket.model_dump(mode="json") if c.peak_bucket else None,
           "comparison": c.comparison.model_dump(mode="json") if c.comparison else None,
           "hourly_data_available": c.hourly_data_available, "insufficient_reasons": c.insufficient_reasons}
    quality: Quality = "REAL" if c.readings_used >= 2 else "ESTIMATED"
    return ToolResult(_json(out), [Source("consumption", f"Consumo {c.from_date:%d/%m/%Y}–{c.to_date:%d/%m/%Y}", quality, "/consumption")],
                      list(c.insufficient_reasons))


def equipment_estimate(db: Session, home: Home, _: _NoInput) -> ToolResult:
    e = equipment.build_estimate(db, home)
    items = sorted(e.items, key=lambda i: i.monthly_kwh.value, reverse=True)
    out = {"equipment_count": e.equipment_count, "days_per_month": e.days_per_month,
           "items": [{"name": i.name, "kind": i.kind, "room": i.room, "monthly_kwh": _metric(i.monthly_kwh), "share_pct": _metric(i.share_pct)}
                     for i in items],
           "total_monthly_kwh": _metric(e.total_monthly_kwh), "latest_bill_kwh": _metric(e.latest_bill_kwh),
           "bill_coverage_pct": _metric(e.bill_coverage_pct), "note": e.note}
    warnings = [] if e.equipment_count else ["La vivienda no tiene equipos registrados; no se puede decir cuál consume más."]
    return ToolResult(_json(out), [Source("equipment", "Equipos declarados (consumo estimado)", "ESTIMATED", "/equipment")], warnings)


def active_recommendations(db: Session, home: Home, _: _NoInput) -> ToolResult:
    rows = recommendations.list_recommendations(db, home.id, status="active", limit=10)
    items = [{"title": r.title, "summary": r.summary, "action": r.action, "confidence": r.confidence,
              "savings_kwh_month": None if r.savings_kwh_month is None else str(r.savings_kwh_month),
              "savings_dop_month": None if r.savings_dop_month is None else str(r.savings_dop_month),
              "savings_quality": "ESTIMATED", "assumptions": r.assumptions} for r in rows]
    return ToolResult(_json({"recommendations": items, "count": len(items)}),
                      [Source("recommendation", r.title, "ESTIMATED", "/savings") for r in rows],
                      [] if rows else ["No hay recomendaciones vigentes para esta vivienda."])


def tariff_cost(db: Session, home: Home, args: _CostInput) -> ToolResult:
    on = today_rd()
    est = tariffs.estimate_cost(db, home.distributor, on, args.kwh)
    if est.breakdown is None or est.tariff is None:
        return ToolResult(_json({"status": est.status, "reason": est.reason}), [], [est.reason or "No hay tarifa vigente."])
    out = {"distributor": home.distributor, "on": on, "kwh": str(args.kwh), "total_rd": str(est.breakdown.total_rd),
           "fixed_charge_rd": str(est.breakdown.fixed_charge_rd), "energy_rd": str(est.breakdown.energy_rd), "mode": est.breakdown.mode,
           "quality": "ESTIMATED", "tariff_source": est.source_resolution,
           "note": "Estimación con la tarifa regulada vigente; puede diferir de la factura por impuestos, ajustes o lecturas."}
    return ToolResult(_json(out), [Source("tariff", f"Tarifa regulada {home.distributor} ({est.source_resolution})", "REAL", None),
                                   Source("cost", f"Costo estimado de {args.kwh} kWh", "ESTIMATED", None)])


def score(db: Session, home: Home, _: _NoInput) -> ToolResult:
    s = energy_score.build_score(db, home.id)
    out = {"status": s.status, "score": s.score, "band": s.band_label, "coverage_pct": s.coverage_pct, "reasons": s.reasons,
           "components": [c.model_dump(mode="json") for c in s.components], "method": s.method, "note": s.note, "quality": "INFERRED"}
    return ToolResult(_json(out), [Source("score", "Energy Score", "INFERRED", "/dashboard")],
                      list(s.reasons) if s.status != "ok" else [])


def outage_summary(db: Session, home: Home, args: _OutagesInput) -> ToolResult:
    o = outages.build_summary(db, home.id, months=args.months)
    return ToolResult(_json({"from_month": o.from_month, "to_month": o.to_month, "totals": o.totals.model_dump(mode="json"),
                             "months": [m.model_dump(mode="json") for m in o.months], "note": o.note}),
                      [Source("outage", "Apagones registrados por la persona usuaria", "REAL", "/outages")])


def goal_progress(db: Session, home: Home, _: _NoInput) -> ToolResult:
    g = goals.build_progress(db, home.id, None)
    return ToolResult(_json(g.model_dump(mode="json", exclude={"home_id", "quality_legend"})),
                      [Source("goal", "Meta mensual", "PROJECTED", "/goal")], list(g.reasons))


@dataclass(frozen=True)
class ToolSpec:
    name: str
    label: str  # lo que la interfaz muestra mientras corre («Consultando facturas…»)
    description: str
    schema: type[BaseModel]
    run: Callable[[Session, Home, Any], ToolResult]


def _input_schema(model: type[BaseModel]) -> dict:
    schema = model.model_json_schema()
    schema.pop("title", None)
    for prop in schema.get("properties", {}).values():
        prop.pop("title", None)
    schema["additionalProperties"] = False
    return schema


SPECS: tuple[ToolSpec, ...] = (
    ToolSpec("get_home_overview", "Revisando el resumen de la vivienda",
             "Resumen de la vivienda: última factura (REAL), comparación con la anterior, proyección de la próxima (PROJECTED) y estado "
             "de los datos. Úsala primero para preguntas generales, de gasto o de cuánto se pagará.", _NoInput, home_overview),
    ToolSpec("list_bills", "Consultando facturas",
             "Últimas facturas registradas (REAL): período, kWh, monto en RD$, vencimiento y si está pagada.", _BillsInput, list_bills),
    ToolSpec("get_consumption", "Consultando consumo",
             "Consumo calculado desde las lecturas del medidor en un rango de fechas (máx. 366 días), con promedio diario, pico, costo "
             "estimado y comparación con el período anterior. Fechas ISO (AAAA-MM-DD) en hora de República Dominicana.",
             _ConsumptionInput, consumption_range),
    ToolSpec("get_equipment_estimate", "Revisando equipos",
             "Equipos declarados con su consumo mensual ESTIMADO y su participación; sirve para saber qué equipo consume más.",
             _NoInput, equipment_estimate),
    ToolSpec("list_recommendations", "Buscando recomendaciones",
             "Recomendaciones de ahorro vigentes, con ahorro ESTIMADO, confianza y supuestos.", _NoInput, active_recommendations),
    ToolSpec("estimate_cost", "Calculando con la tarifa",
             "Costo ESTIMADO de una cantidad de kWh con la tarifa regulada vigente de la distribuidora de la vivienda.", _CostInput, tariff_cost),
    ToolSpec("get_energy_score", "Revisando el Energy Score",
             "Energy Score 0–100 (INFERIDO, orientativo) con sus componentes y motivos.", _NoInput, score),
    ToolSpec("get_outage_summary", "Revisando apagones",
             "Resumen mensual de apagones registrados por la persona usuaria.", _OutagesInput, outage_summary),
    ToolSpec("get_goal_progress", "Revisando la meta",
             "Progreso de la meta mensual de consumo o gasto y su proyección.", _NoInput, goal_progress),
)
BY_NAME = {spec.name: spec for spec in SPECS}


def definitions() -> list[dict]:
    """Lista fija y en orden estable (el prefijo de la caché de prompts depende de ello)."""
    return [{"name": s.name, "description": s.description, "input_schema": _input_schema(s.schema), "eager_input_streaming": True}
            for s in SPECS]


def run_tool(db: Session, home: Home, name: str, raw_input: Any) -> ToolResult:
    spec = BY_NAME.get(name)
    if spec is None:
        return ToolResult(_json({"error": "unknown_tool"}), is_error=True)
    if not isinstance(raw_input, dict):
        return ToolResult(_json({"INVALID_JSON": "la entrada debe ser un objeto"}), is_error=True)
    try:
        args = spec.schema.model_validate(raw_input)
    except ValidationError as exc:
        problems = [{"field": ".".join(map(str, e["loc"])), "problem": e["msg"]} for e in exc.errors(include_input=False, include_url=False)]
        return ToolResult(_json({"invalid_input": problems}), is_error=True)
    try:
        return spec.run(db, home, args)
    except ApplicationError as exc:  # p. ej. rango de fechas inválido: el mensaje es nuestro y seguro
        return ToolResult(_json({"error": str(exc)}), is_error=True)


def default_period(today: date | None = None) -> tuple[date, date]:
    """Últimos 30 días hasta hoy (hora de RD): el período que asume la interfaz si la persona no elige otro."""
    end = today or today_rd()
    return end - timedelta(days=29), end
