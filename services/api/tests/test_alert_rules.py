"""ERD-ALERT-02: reglas puras de pago y de datos incompletos."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal as D
from types import SimpleNamespace as NS
from uuid import uuid4

from app.services import alert_rules as rules

TODAY = date(2026, 10, 10)


def bill(end_ago=10, days=30, due_in=None, paid=False, amount=3600):
    end = TODAY - timedelta(days=end_ago)
    return NS(id=uuid4(), period_start=end - timedelta(days=days - 1), period_end=end, days=days, amount_dop=D(amount),
              due_date=None if due_in is None else TODAY + timedelta(days=due_in),
              paid_at=datetime(2026, 10, 1, tzinfo=timezone.utc) if paid else None)


# ---------- pago ----------
def test_no_due_date_means_no_payment_alert():
    assert rules.payment_alert([bill(due_in=None)], TODAY) is None
    assert rules.payment_alert([], TODAY) is None


def test_payment_severity_follows_the_days_left():
    for left, severity in ((9, None), (8, None), (7, "info"), (4, "info"), (3, "warning"), (1, "warning"), (0, "warning"), (-1, "critical"), (-30, "critical")):
        alert = rules.payment_alert([bill(due_in=left)], TODAY)
        assert (alert.severity if alert else None) == severity, left


def test_payment_message_says_when_and_how_much_without_inventing():
    b = bill(due_in=0, amount=4520.75)
    msg = rules.payment_alert([b], TODAY).message
    assert "vence hoy" in msg and "RD$ 4,520.75" in msg and str(b.due_date) in msg
    assert "vence mañana" in rules.payment_alert([bill(due_in=1)], TODAY).message
    assert "vence en 3 días" in rules.payment_alert([bill(due_in=3)], TODAY).message
    overdue = rules.payment_alert([bill(due_in=-1)], TODAY)
    assert "hace 1 día" in overdue.message and "márquela como pagada" in overdue.message
    assert "hace 5 días" in rules.payment_alert([bill(due_in=-5)], TODAY).message


def test_paid_bills_never_alert_and_the_key_is_per_bill():
    assert rules.payment_alert([bill(due_in=-5, paid=True)], TODAY) is None
    b = bill(due_in=2)
    assert rules.payment_alert([b], TODAY).key == f"payment:{b.id}" and rules.payment_alert([b], TODAY).bill_id == b.id


def test_only_the_latest_bill_can_be_pending():
    old = bill(end_ago=40, due_in=-20)
    newest = bill(end_ago=10, due_in=None)
    assert rules.payment_alert([old, newest], TODAY) is None           # la vieja se da por resuelta
    assert rules.payment_alert([old], TODAY).severity == "critical"    # si es la única, sí cuenta


def test_ancient_overdue_is_treated_as_forgotten_not_as_debt():
    assert rules.payment_alert([bill(due_in=-181)], TODAY) is None
    assert rules.payment_alert([bill(due_in=-180)], TODAY) is not None


# ---------- datos incompletos ----------
def test_missing_bill_appears_after_a_cycle_plus_grace_and_escalates():
    assert rules.missing_bill_alert([], TODAY) is None
    assert rules.missing_bill_alert([bill(end_ago=36)], TODAY) is None                 # 36 < 30 + 7
    info = rules.missing_bill_alert([bill(end_ago=37)], TODAY)
    assert info.severity == "info" and "37 días" in info.message
    assert rules.missing_bill_alert([bill(end_ago=66)], TODAY).severity == "info"
    assert rules.missing_bill_alert([bill(end_ago=67)], TODAY).severity == "warning"   # dos ciclos sin factura


def test_missing_bill_uses_the_bills_own_cycle_length_and_key():
    b = bill(end_ago=45, days=60)
    assert rules.missing_bill_alert([b], TODAY) is None                                # ciclo de 60 días: aún no toca
    assert rules.missing_bill_alert([bill(end_ago=40)], TODAY).key.startswith("missing_bill:")


def test_stale_readings_only_for_people_who_use_readings():
    assert rules.stale_readings_alert(0, None, TODAY) is None
    assert rules.stale_readings_alert(1, TODAY - timedelta(days=60), TODAY) is None    # una sola lectura: no hay hábito
    assert rules.stale_readings_alert(5, TODAY - timedelta(days=13), TODAY) is None
    alert = rules.stale_readings_alert(5, TODAY - timedelta(days=14), TODAY)
    assert alert.severity == "info" and alert.key == "stale_readings" and "14 días" in alert.message and alert.bill_id is None
