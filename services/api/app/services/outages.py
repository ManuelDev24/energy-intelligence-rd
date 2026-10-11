"""ERD-INT-01: registro manual de interrupciones del servicio eléctrico y su resumen mensual. Sin FastAPI.

Una interrupción sin `ended_at` está en curso: su duración corre hasta «ahora» y así se cuenta en el resumen (marcada
como `ongoing`). Cada interrupción se atribuye ENTERA al mes (America/Santo_Domingo) en que empezó. Una vivienda no puede
tener dos interrupciones solapadas; la base lo garantiza con una restricción de exclusión y el servicio da un mensaje claro
antes de llegar a ella.
"""
from datetime import datetime, timezone

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.models import PowerOutage
from app.schemas.outage import OutageMonth, OutageSummaryOut, OutageTotals
from app.services import consumption_calc as cc
from app.services.audit import record_change, snapshot
from app.services.errors import ApplicationError, NotFound
from app.services.transactions import require_home, write_transaction

TIMEZONE_NAME = "America/Santo_Domingo"
OVERLAP = "Ya hay una interrupción registrada que se solapa con ese período. Edita esa o ajusta las horas."
NOTE = ("Cada interrupción se cuenta entera en el mes en que empezó. Una que sigue abierta suma su duración hasta ahora. "
        "Son datos que tú registras a mano: no se miden ni se verifican con la distribuidora.")
INFINITY = datetime.max.replace(tzinfo=timezone.utc)


def get_outage(db: Session, home_id, outage_id) -> PowerOutage:
    row = db.scalar(select(PowerOutage).where(PowerOutage.id == outage_id, PowerOutage.home_id == home_id))
    if row is None:
        raise NotFound("Interrupción no encontrada para esta vivienda")
    return row


def list_outages(db: Session, home_id, *, limit: int = 100, offset: int = 0) -> list[PowerOutage]:
    require_home(db, home_id)
    return list(db.scalars(select(PowerOutage).where(PowerOutage.home_id == home_id)
                           .order_by(PowerOutage.started_at.desc(), PowerOutage.id.desc()).limit(limit).offset(offset)))


def _ensure_free(db: Session, home_id, started_at: datetime, ended_at: datetime | None, *, ignore=None) -> None:
    """Rechaza una interrupción que se solape con otra de la vivienda: [inicio, fin) contra [inicio, fin), abierta = infinito."""
    end = ended_at or INFINITY
    query = select(PowerOutage.id).where(
        PowerOutage.home_id == home_id,
        PowerOutage.started_at < end,
        or_(PowerOutage.ended_at.is_(None), PowerOutage.ended_at > started_at),
    )
    if ignore is not None:
        query = query.where(PowerOutage.id != ignore)
    if db.scalar(query.limit(1)) is not None:
        raise ApplicationError(OVERLAP)


def create_outage(db: Session, home_id, payload) -> PowerOutage:
    with write_transaction(db):
        require_home(db, home_id, lock=True)       # serializa las escrituras de la vivienda: sin carreras entre solapes
        _ensure_free(db, home_id, payload.started_at, payload.ended_at)
        row = PowerOutage(home_id=home_id, **payload.model_dump())
        db.add(row)
        record_change(db, home_id, row, "create")
    return row


def update_outage(db: Session, home_id, outage_id, payload) -> PowerOutage:
    with write_transaction(db):
        require_home(db, home_id, lock=True)
        row = get_outage(db, home_id, outage_id)
        before = snapshot(row)
        _ensure_free(db, home_id, payload.started_at, payload.ended_at, ignore=row.id)
        for key, value in payload.model_dump().items():
            setattr(row, key, value)
        record_change(db, home_id, row, "update", before)
    return row


def delete_outage(db: Session, home_id, outage_id) -> None:
    with write_transaction(db):
        require_home(db, home_id, lock=True)
        row = get_outage(db, home_id, outage_id)
        record_change(db, home_id, row, "delete", snapshot(row))
        db.delete(row)


def _month_key(moment: datetime) -> str:
    local = moment.astimezone(cc.SANTO_DOMINGO)
    return f"{local.year:04d}-{local.month:02d}"


def _months(end_key: str, count: int) -> list[str]:
    year, month = int(end_key[:4]), int(end_key[5:])
    index = year * 12 + month - 1
    return [f"{(index - n) // 12:04d}-{(index - n) % 12 + 1:02d}" for n in range(count - 1, -1, -1)]


def _minutes(row: PowerOutage, now: datetime) -> int:
    return max(int(((row.ended_at or now) - row.started_at).total_seconds() // 60), 0)


def build_summary(db: Session, home_id, *, months: int = 12, now: datetime | None = None) -> OutageSummaryOut:
    require_home(db, home_id)
    current = now or datetime.now(timezone.utc)
    keys = _months(_month_key(current), months)
    first_local = datetime(int(keys[0][:4]), int(keys[0][5:]), 1, tzinfo=cc.SANTO_DOMINGO)
    rows = list(db.scalars(select(PowerOutage).where(PowerOutage.home_id == home_id, PowerOutage.started_at >= first_local)
                           .order_by(PowerOutage.started_at)))
    per_month: dict[str, list[PowerOutage]] = {k: [] for k in keys}
    for row in rows:
        per_month.setdefault(_month_key(row.started_at), []).append(row)

    def totals_of(items: list[PowerOutage]) -> tuple[int, int, int, int | None, int]:
        durations = [_minutes(r, current) for r in items]
        total = sum(durations)
        return (len(items), total, max(durations, default=0), round(total / len(items)) if items else None,
                sum(1 for r in items if r.ended_at is None))

    month_rows = []
    for key in keys:
        count, total, longest, average, ongoing = totals_of(per_month[key])
        month_rows.append(OutageMonth(month=key, count=count, total_minutes=total, longest_minutes=longest, average_minutes=average, ongoing=ongoing))
    count, total, longest, average, ongoing = totals_of([r for k in keys for r in per_month[k]])
    return OutageSummaryOut(home_id=home_id, timezone=TIMEZONE_NAME, from_month=keys[0], to_month=keys[-1], months=month_rows,
                            totals=OutageTotals(count=count, total_minutes=total, longest_minutes=longest, average_minutes=average, ongoing=ongoing),
                            note=NOTE)
