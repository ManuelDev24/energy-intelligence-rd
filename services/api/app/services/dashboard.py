"""Arma el dashboard de una vivienda a partir de sus facturas mensuales."""
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Bill, Home
from app.schemas.dashboard import (
    AlertOut, Comparison, DashboardHome, DashboardOut, DataStatus, LatestBill, Metric, ProjectionOut,
)
from app.services import calculations as calc
from app.services.alerts import thresholds as alert_thresholds

QUALITY_LEGEND = {
    "REAL": "Dato tomado directamente de una factura mensual introducida.",
    "ESTIMATED": "Valor derivado de totales mensuales (promedios); no es una medición directa.",
    "PROJECTED": "Proyección lineal a partir del historial de facturas; no es un dato observado.",
}


def _m(value: Decimal, unit: str, quality: str) -> Metric:
    return Metric(value=value, unit=unit, quality=quality)


def build_dashboard(db: Session, home: Home) -> DashboardOut:
    bills = list(db.scalars(
        select(Bill).where(Bill.home_id == home.id).order_by(Bill.period_end.asc(), Bill.period_start.asc())
    ))
    reasons: list[str] = []
    sources = {b.source for b in bills}
    data_source = "none" if not bills else (next(iter(sources)) if len(sources) == 1 else "mixed")
    def status() -> DataStatus:  # se construye al final: pydantic copia la lista de motivos
        return DataStatus(bills_count=len(bills), data_source=data_source, is_demo="seed" in sources,
                          insufficient_reasons=list(reasons))

    head = DashboardHome(id=home.id, code=home.code, name=home.name, distributor=home.distributor)

    if not bills:
        reasons.append("No hay facturas registradas: registre al menos una para ver consumo.")
        return DashboardOut(home=head, latest_bill=None, comparison=None, projection=None, alert=None,
                            recommendation=None, data_status=status(), quality_legend=QUALITY_LEGEND)

    latest = bills[-1]
    avg_daily = (_m(calc.q2(latest.kwh / latest.days), "kWh/día", "ESTIMATED") if latest.days > 0 else None)
    avg_price = (_m(calc.q2(latest.amount_dop / latest.kwh), "RD$/kWh", "ESTIMATED") if latest.kwh > 0 else None)
    latest_out = LatestBill(
        bill_id=latest.id, period_start=latest.period_start, period_end=latest.period_end, days=latest.days,
        kwh=_m(latest.kwh, "kWh", "REAL"), amount_dop=_m(latest.amount_dop, "RD$", "REAL"),
        avg_daily_kwh=avg_daily, avg_price_per_kwh=avg_price, source=latest.source,
    )

    comparison = alert = recommendation = None
    if len(bills) >= calc.MIN_BILLS_COMPARISON:
        prev = bills[-2]
        v = calc.variation(latest, prev)
        comparison = Comparison(
            previous_bill_id=prev.id, previous_period_start=prev.period_start, previous_period_end=prev.period_end,
            kwh_delta=_m(v.kwh_delta, "kWh", "REAL"),
            kwh_pct=_m(v.kwh_pct, "%", "REAL") if v.kwh_pct is not None else None,
            amount_delta=_m(v.amount_delta, "RD$", "REAL"),
            amount_pct=_m(v.amount_pct, "%", "REAL") if v.amount_pct is not None else None,
        )
        if v.kwh_pct is None:
            reasons.append("El período anterior tiene 0 kWh: no se calcula variación porcentual.")
        warning_pct, critical_pct = alert_thresholds(db, home.id)
        sev = calc.severity_for(v.kwh_pct, warning_pct, critical_pct)
        if sev:
            alert = AlertOut(
                severity=sev,
                message=(f"El consumo subió {v.kwh_pct}% frente al período anterior "
                         f"({prev.kwh} kWh → {latest.kwh} kWh)."),
                basis_period_start=prev.period_start, basis_period_end=prev.period_end,
            )
            recommendation = ("Revise equipos de mayor uso (aire acondicionado, nevera, calentador) y compare "
                              "con su rutina del mes anterior. Una factura mensual no permite identificar picos.")
    else:
        reasons.append("Se necesitan al menos 2 facturas para comparar períodos.")

    projection = None
    proj = calc.project_next(bills)
    if proj is not None:
        projection = ProjectionOut(
            method=proj.method, bills_used=proj.bills_used,
            kwh=_m(proj.kwh, "kWh", "PROJECTED"), amount_dop=_m(proj.amount_dop, "RD$", "PROJECTED"),
            note="Proyección de la próxima factura mensual por tendencia lineal; no incluye cambios de tarifa.",
        )
    else:
        reasons.append("Se necesitan al menos 2 facturas para proyectar la próxima.")

    return DashboardOut(home=head, latest_bill=latest_out, comparison=comparison, projection=projection,
                        alert=alert, recommendation=recommendation, data_status=status(),
                        quality_legend=QUALITY_LEGEND)
