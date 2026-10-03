from datetime import date
from decimal import Decimal as D
from types import SimpleNamespace as NS

from app.services import calculations as calc


def b(kwh, amount, days=30):
    return NS(period_start=date(2026, 1, 1), period_end=date(2026, 1, 30), kwh=D(str(kwh)),
              amount_dop=D(str(amount)), days=days)


def test_variation_exact():
    v = calc.variation(b(300, 3600), b(250, 3000))
    assert (v.kwh_delta, v.kwh_pct, v.amount_delta, v.amount_pct) == (D("50.00"), D("20.00"), D("600.00"), D("20.00"))


def test_variation_decrease():
    v = calc.variation(b(200, 2000), b(250, 2500))
    assert v.kwh_pct == D("-20.00")


def test_variation_zero_base_has_no_pct():
    v = calc.variation(b(100, 1000), b(0, 0))
    assert v.kwh_pct is None and v.amount_pct is None and v.kwh_delta == D("100.00")


def test_projection_exact_linear():
    # 100, 200, 300 -> próxima 400 exacta
    p = calc.project_next([b(100, 1000), b(200, 2000), b(300, 3000)])
    assert p.kwh == D("400.00") and p.amount_dop == D("4000.00") and p.bills_used == 3


def test_projection_two_points():
    p = calc.project_next([b(250, 3000), b(280, 3300)])
    assert p.kwh == D("310.00")


def test_projection_constant():
    assert calc.project_next([b(100, 1), b(100, 1), b(100, 1)]).kwh == D("100.00")


def test_projection_never_negative():
    assert calc.project_next([b(100, 100), b(10, 10)]).kwh == D("0.00")


def test_projection_insufficient_history():
    assert calc.project_next([]) is None
    assert calc.project_next([b(100, 100)]) is None


def test_projection_uses_last_six_only():
    bills = [b(1000, 1)] * 5 + [b(10 * i, 1) for i in range(1, 7)]
    assert calc.project_next(bills).bills_used == 6


def test_severity_thresholds():
    assert calc.severity_for(None) is None
    assert calc.severity_for(D("19.99")) is None
    assert calc.severity_for(D("20")) == "warning"
    assert calc.severity_for(D("39.99")) == "warning"
    assert calc.severity_for(D("40")) == "critical"
