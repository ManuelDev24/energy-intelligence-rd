"""Resolución de tarifas publicadas y estimación de costo. Sin tarifa vigente -> 'tariff_unavailable'."""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Literal

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import TARIFF_DISTRIBUTORS, Tariff
from app.services import tariff_calc

# Las viviendas aún no guardan su código tarifario: se asume residencial BTS-1 (documentado).
RESIDENTIAL_TARIFF_CODE = "BTS-1"


def list_tariffs(db: Session, distributor=None, on: date | None = None, limit=100, offset=0):
    query = select(Tariff)
    if distributor is not None:
        query = query.where(Tariff.distributor == distributor)
    if on is not None:
        query = query.where(Tariff.effective_from <= on,
                            or_(Tariff.effective_to.is_(None), Tariff.effective_to >= on))
    return list(db.scalars(query.order_by(Tariff.distributor, Tariff.tariff_code, Tariff.effective_from.desc(),
                                          Tariff.id).limit(limit).offset(offset)))


@dataclass(frozen=True)
class TariffResolution:
    status: Literal["available", "tariff_unavailable"]
    tariff: Tariff | None
    reason: str | None


def resolve_tariff(db: Session, distributor: str, on: date,
                   tariff_code: str = RESIDENTIAL_TARIFF_CODE) -> TariffResolution:
    """Versión vigente en `on`. Nunca reutiliza una versión vencida."""
    if distributor not in TARIFF_DISTRIBUTORS:
        return TariffResolution("tariff_unavailable", None,
                                f"La distribuidora '{distributor}' no tiene tarifa regulada cargada.")
    tariff = db.scalar(select(Tariff).where(
        Tariff.distributor == distributor, Tariff.tariff_code == tariff_code, Tariff.effective_from <= on,
        or_(Tariff.effective_to.is_(None), Tariff.effective_to >= on)).order_by(Tariff.effective_from.desc()).limit(1))
    if tariff is None:
        return TariffResolution("tariff_unavailable", None,
                                f"No hay tarifa {tariff_code} vigente de {distributor} para {on.isoformat()}.")
    return TariffResolution("available", tariff, None)


@dataclass(frozen=True)
class CostEstimate:
    status: Literal["available", "tariff_unavailable"]
    breakdown: tariff_calc.CostBreakdown | None
    tariff: Tariff | None
    source_resolution: str | None
    reason: str | None


def estimate_cost(db: Session, distributor: str, on: date, kwh: Decimal) -> CostEstimate:
    res = resolve_tariff(db, distributor, on)
    if res.tariff is None:
        return CostEstimate("tariff_unavailable", None, None, None, res.reason)
    return CostEstimate("available", tariff_calc.cost(kwh, res.tariff), res.tariff,
                        res.tariff.source_resolution, None)
