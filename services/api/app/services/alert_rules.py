"""ERD-ALERT-02: reglas de alertas de pago y de datos incompletos. Puras: sin HTTP, ORM ni base de datos.

Honestidad: sin fecha límite de pago registrada no hay alerta de pago (no se infiere una); solo la factura MÁS RECIENTE
puede estar pendiente (las anteriores se dan por resueltas al existir una posterior, y evita avisar «vencida» por cada
factura histórica que alguien capturó); «datos incompletos» son avisos informativos, nunca urgentes.
"""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Literal, Sequence

Severity = Literal["info", "warning", "critical"]
PAYMENT_INFO_DAYS = 7
PAYMENT_WARNING_DAYS = 3
PAYMENT_STALE_DAYS = 180
MISSING_BILL_GRACE_DAYS = 7
STALE_READINGS_DAYS = 14
STALE_READINGS_MIN_COUNT = 2


@dataclass(frozen=True)
class RuleAlert:
    type: str
    severity: Severity
    key: str
    message: str
    bill_id: object | None = None


def _when(days_left: int) -> str:
    return "vence hoy" if days_left == 0 else "vence mañana" if days_left == 1 else f"vence en {days_left} días"


def payment_alert(bills: Sequence, today: date) -> RuleAlert | None:
    """Solo para la factura más reciente, con fecha límite y sin marcar como pagada."""
    if not bills:
        return None
    latest = max(bills, key=lambda b: (b.period_end, b.period_start))
    if latest.due_date is None or latest.paid_at is not None:
        return None
    left = (latest.due_date - today).days
    period = f"{latest.period_start} al {latest.period_end}"
    amount = f"RD$ {Decimal(latest.amount_dop):,.2f}"
    if left < 0:
        if -left > PAYMENT_STALE_DAYS:
            return None  # tanto tiempo sin marcarla pagada es más probable un olvido que una deuda
        days = -left
        return RuleAlert("payment_due", "critical", f"payment:{latest.id}",
                         f"La factura del {period} ({amount}) venció el {latest.due_date}, hace {days} {'día' if days == 1 else 'días'}. "
                         "Si ya la pagó, márquela como pagada.", latest.id)
    if left > PAYMENT_INFO_DAYS:
        return None
    severity: Severity = "warning" if left <= PAYMENT_WARNING_DAYS else "info"
    return RuleAlert("payment_due", severity, f"payment:{latest.id}",
                     f"La factura del {period} ({amount}) {_when(left)} ({latest.due_date}).", latest.id)


def missing_bill_alert(bills: Sequence, today: date) -> RuleAlert | None:
    """Pasó el ciclo esperado desde el cierre de la última factura y no hay otra: se avisa para mantener el historial al día."""
    if not bills:
        return None
    latest = max(bills, key=lambda b: (b.period_end, b.period_start))
    cycle = latest.days if latest.days and latest.days > 0 else 30
    gap = (today - latest.period_end).days
    if gap < cycle + MISSING_BILL_GRACE_DAYS:
        return None
    severity: Severity = "warning" if gap >= 2 * cycle + MISSING_BILL_GRACE_DAYS else "info"
    return RuleAlert("missing_bill", severity, f"missing_bill:{latest.id}",
                     f"Han pasado {gap} días desde el cierre de su última factura registrada ({latest.period_start} al {latest.period_end}). "
                     "Registre la siguiente para que las comparaciones y proyecciones sigan al día.", latest.id)


def stale_readings_alert(reading_count: int, last_reading: date | None, today: date) -> RuleAlert | None:
    """Solo para quien ya usa lecturas: con una sola lectura no hay hábito que se haya roto."""
    if last_reading is None or reading_count < STALE_READINGS_MIN_COUNT:
        return None
    gap = (today - last_reading).days
    if gap < STALE_READINGS_DAYS:
        return None
    return RuleAlert("stale_readings", "info", "stale_readings",
                     f"Hace {gap} días que no registra una lectura del medidor (la última fue el {last_reading}). "
                     "Con lecturas recientes se detectan antes los cambios de consumo.")
