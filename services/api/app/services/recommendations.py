"""ERD-SAVE-01: recomendaciones de ahorro por vivienda — hechos, conciliación idempotente y estados. Sin FastAPI.

`refresh_home` recalcula con el motor puro (`recommendation_engine`) y concilia con lo guardado por `dedupe_key`:
crea lo nuevo, actualiza lo vigente (también si subió la versión de la regla), reabre lo que reaparece y pasa a
`resolved` lo que dejó de aplicar. Lo aplicado o descartado por la persona no se modifica. Llamarlo dos veces seguidas
con los mismos datos no cambia nada. Se invoca tras escribir equipos/meta, desde el escaneo de anomalías y a pedido.
"""
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Anomaly, Bill, Equipment, HomeGoal, Recommendation
from app.services import calculations as calc
from app.services import recommendation_engine as engine
from app.services.errors import ApplicationError, InvalidInput, NotFound
from app.services.transactions import require_home, write_transaction

log = logging.getLogger("energyrd.recommendations")
USER_STATUSES = ("active", "applied", "dismissed")
FROZEN = ("applied", "dismissed")          # decisión de la persona: el motor no la toca
PRICE_BILLS = 3


@dataclass
class RefreshResult:
    created: int = 0
    updated: int = 0
    reopened: int = 0
    resolved: int = 0

    def as_dict(self) -> dict:
        return {"created": self.created, "updated": self.updated, "reopened": self.reopened, "resolved": self.resolved}


def gather_facts(db: Session, home_id) -> engine.Facts:
    items = list(db.scalars(select(Equipment).where(Equipment.home_id == home_id).order_by(Equipment.room, Equipment.name, Equipment.id)))
    shares = calc.shares_pct([e.power_w * e.hours_per_day for e in items])
    equipment = [
        engine.EquipmentFact(id=e.id, name=e.name, kind=e.kind, power_w=e.power_w, hours_per_day=e.hours_per_day, share_pct=share,
                             monthly_kwh=calc.equipment_monthly_kwh(e.power_w, e.hours_per_day))
        for e, share in zip(items, shares, strict=True)
    ]
    bills = list(db.scalars(select(Bill).where(Bill.home_id == home_id).order_by(Bill.period_start, Bill.period_end)))
    recent = [b for b in bills[-PRICE_BILLS:] if b.kwh > 0]
    total_kwh = sum((b.kwh for b in recent), Decimal(0))
    price = calc.q2(sum((b.amount_dop for b in recent), Decimal(0)) / total_kwh) if total_kwh > 0 else None
    projection = calc.project_next(bills)
    goal = db.get(HomeGoal, home_id)
    anomalies = [
        engine.AnomalyFact(id=a.id, kind=a.kind, severity=a.severity, period_start=a.period_start, period_end=a.period_end, delta_pct=a.delta_pct)
        for a in db.scalars(select(Anomaly).where(Anomaly.home_id == home_id, Anomaly.status == "open")
                            .order_by(Anomaly.period_end.desc(), Anomaly.id).limit(10))
    ]
    return engine.Facts(
        equipment=equipment, price_per_kwh=price, bills_count=len(bills),
        goal_kwh=goal.monthly_kwh if goal else None, goal_amount_dop=goal.monthly_amount_rd if goal else None,
        projected_kwh=projection.kwh if projection else None, projected_amount_dop=projection.amount_dop if projection else None,
        anomalies=anomalies,
    )


def _apply(row: Recommendation, c: engine.Candidate) -> int:
    changed = 0
    for attr, value in (
        ("rule_id", c.rule_id), ("rule_version", c.rule_version), ("ruleset_version", engine.RULESET_VERSION), ("category", c.category),
        ("title", c.title), ("summary", c.summary), ("action", c.action), ("confidence", c.confidence),
        ("savings_kwh_month", c.savings_kwh), ("savings_dop_month", c.savings_dop), ("equipment_id", c.equipment_id),
        ("anomaly_id", c.anomaly_id), ("assumptions", list(c.assumptions)), ("evidence", c.evidence),
    ):
        if getattr(row, attr) != value:
            setattr(row, attr, value)
            changed += 1
    return changed


def refresh_home(db: Session, home_id, *, now: datetime | None = None, commit: bool = True) -> RefreshResult:
    current = now or datetime.now(timezone.utc)

    def run() -> RefreshResult:
        require_home(db, home_id, lock=True)
        candidates = {c.dedupe_key: c for c in engine.evaluate(gather_facts(db, home_id))}
        stored = {r.dedupe_key: r for r in db.scalars(select(Recommendation).where(Recommendation.home_id == home_id)
                                                      .execution_options(populate_existing=True))}
        result = RefreshResult()
        for key, c in candidates.items():
            row = stored.get(key)
            if row is None:
                row = Recommendation(home_id=home_id, dedupe_key=key, status="active", created_at=current, last_seen_at=current,
                                     status_changed_at=current, rule_id=c.rule_id, rule_version=c.rule_version,
                                     ruleset_version=engine.RULESET_VERSION, category=c.category, title=c.title, summary=c.summary,
                                     action=c.action, confidence=c.confidence)
                _apply(row, c)
                db.add(row)
                result.created += 1
                continue
            if row.status in FROZEN:
                continue
            if row.status == "resolved":
                row.status, row.status_changed_at = "active", current
                result.reopened += 1
            result.updated += 1 if _apply(row, c) else 0
            row.last_seen_at = current
        for key, row in stored.items():
            if key not in candidates and row.status == "active":
                row.status, row.status_changed_at = "resolved", current
                result.resolved += 1
        db.flush()
        return result

    if not commit:
        return run()
    with write_transaction(db):
        return run()


def refresh_after_write(db: Session, home_id) -> None:
    """Para los servicios de escritura: recalcula dentro de la misma transacción y NUNCA hace fallar la escritura."""
    try:
        with db.begin_nested():
            refresh_home(db, home_id, commit=False)
    except Exception:  # noqa: BLE001 — se recalcula en el siguiente escaneo; el dato de la persona ya es válido
        log.exception("recommendation refresh failed after write", extra={"home_id": str(home_id)})


def list_recommendations(db: Session, home_id, *, status: str = "active", limit: int = 50) -> list[Recommendation]:
    require_home(db, home_id)
    query = select(Recommendation).where(Recommendation.home_id == home_id)
    if status != "all":
        query = query.where(Recommendation.status == status)
    rows = list(db.scalars(query.limit(500).execution_options(populate_existing=True)))
    order = {"equipment": 0, "goal": 1, "anomaly": 2, "data": 3}
    rows.sort(key=lambda r: (order[r.category], -(r.savings_kwh_month if r.savings_kwh_month is not None else Decimal(-1)), r.dedupe_key))
    return rows[:limit]


def set_status(db: Session, home_id, recommendation_id, status: str, *, now: datetime | None = None) -> Recommendation:
    if status not in USER_STATUSES:
        raise InvalidInput("Estado no válido")
    with write_transaction(db):
        row = db.scalar(select(Recommendation).where(Recommendation.id == recommendation_id, Recommendation.home_id == home_id)
                        .with_for_update().execution_options(populate_existing=True))
        if row is None:
            raise NotFound("Recomendación no encontrada")
        if row.status == "resolved":
            raise ApplicationError("Esta recomendación ya no aplica; no se puede cambiar su estado")
        if row.status != status:
            row.status, row.status_changed_at = status, now or datetime.now(timezone.utc)
    return row


def summary_totals(rows: list[Recommendation]) -> tuple[Decimal | None, Decimal | None]:
    kwh = [r.savings_kwh_month for r in rows if r.status == "active" and r.savings_kwh_month is not None]
    dop = [r.savings_dop_month for r in rows if r.status == "active" and r.savings_dop_month is not None]
    return (calc.q2(sum(kwh, Decimal(0))) if kwh else None, calc.q2(sum(dop, Decimal(0))) if dop else None)


GOAL_PROPOSAL_ASSUMPTIONS = [
    "Parte del promedio de kWh de tus últimas facturas.",
    "Resta el ahorro estimado de las recomendaciones de equipos que sigues teniendo activas.",
    "Es un objetivo, no una garantía: el ahorro real depende de que apliques los cambios.",
]


def goal_proposal(db: Session, home_id) -> dict:
    """Meta mensual propuesta = promedio real de las últimas facturas − ahorro potencial vigente de equipos. Solo lectura."""
    bills = [b for b in db.scalars(select(Bill).where(Bill.home_id == home_id).order_by(Bill.period_start, Bill.period_end))
             if b.kwh > 0][-PRICE_BILLS:]
    goal = db.get(HomeGoal, home_id)
    rows = [r for r in list_recommendations(db, home_id, status="active", limit=100) if r.category == "equipment" and r.savings_kwh_month is not None]
    out: dict = {"home_id": home_id, "proposal": None, "baseline": None, "potential_savings": None, "bills_used": len(bills),
                 "current_goal_kwh": goal.monthly_kwh if goal else None, "reason": None, "assumptions": GOAL_PROPOSAL_ASSUMPTIONS}
    if not bills:
        out["reason"] = "Registra al menos una factura para poder proponer una meta."
        return out
    baseline = calc.q2(sum((b.kwh for b in bills), Decimal(0)) / len(bills))
    savings = calc.q2(sum((r.savings_kwh_month for r in rows), Decimal(0)))
    out["baseline"] = {"value": baseline, "unit": "kWh/mes", "quality": "REAL"}
    out["potential_savings"] = {"value": savings, "unit": "kWh/mes", "quality": "ESTIMATED"} if rows else None
    target = (baseline - savings).quantize(Decimal("1"))
    if not rows:
        out["reason"] = "No hay recomendaciones de equipos vigentes: sin ahorro estimado no se propone una meta distinta de tu consumo."
    elif target <= 0:
        out["reason"] = "El ahorro estimado supera tu consumo promedio; revisa los equipos declarados antes de fijar una meta."
    else:
        out["proposal"] = {"value": target, "unit": "kWh/mes", "quality": "ESTIMATED"}
    return out
