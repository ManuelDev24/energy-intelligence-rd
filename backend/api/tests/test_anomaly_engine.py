"""ERD-ANOM-01-COMPLETE: motor puro de anomalías (picos, aumentos, caídas, nocturno), confianza y deduplicación."""
from datetime import date, datetime, timedelta
from decimal import Decimal as D
from types import SimpleNamespace as NS
from uuid import uuid4

import pytest

from app.services import anomaly_engine as ae
from app.services import consumption_calc as cc

TH = ae.Thresholds()
TZ = cc.SANTO_DOMINGO
D0 = date(2026, 9, 1)
SINCE = date(2026, 1, 1)


def day(n, kwh, days=1, coverage=1, estimated=False):
    start = D0 + timedelta(days=n)
    return ae.Period(start, start, D(str(kwh)), D(str(days)), D(str(coverage)), estimated)


def month(index, kwh, days=30, coverage=1):
    start = date(2026 + (index // 12), index % 12 + 1, 1)
    return ae.Period(start, start + timedelta(days=days - 1), D(str(kwh)), D(str(days)), D(str(coverage)))


def shifts(periods, granularity, source="readings", th=TH):
    return ae.detect_shifts(periods, source=source, granularity=granularity, th=th, since=SINCE)


# ---------- picos (día) ----------
def test_a_day_far_above_typical_is_a_peak_with_an_explanation():
    periods = [day(n, 10) for n in range(7)] + [day(7, 25)]
    (f,) = shifts(periods, "day")
    assert (f.kind, f.severity, f.granularity, f.source) == ("peak", "warning", "day", "readings")
    assert (f.observed_kwh, f.baseline_kwh, f.delta_pct) == (D("25.00"), D("10.00"), D("150.00"))
    assert f.period_start == f.period_end == D0 + timedelta(days=7)
    assert "equipo específico" in f.explanation and "150" in f.explanation and "mediana" in f.explanation
    assert f.dedupe_key == f"peak:readings:day:{f.period_start}:{f.period_end}"


def test_peak_severity_critical_from_200_percent():
    assert shifts([day(n, 10) for n in range(7)] + [day(7, 31)], "day")[0].severity == "critical"


@pytest.mark.parametrize("kwh", [10, 15, 19.9])
def test_ordinary_variation_is_not_a_peak(kwh):
    assert shifts([day(n, 10) for n in range(7)] + [day(7, kwh)], "day") == []


def test_peak_needs_a_minimum_absolute_extra_to_avoid_noise():
    base = [day(n, 1) for n in range(7)]
    assert shifts(base + [day(7, 2.5)], "day") == []          # +150 % pero solo +1.5 kWh
    assert shifts(base + [day(7, 4.5)], "day")[0].kind == "peak"  # +350 % y +3.5 kWh


def test_tiny_baselines_are_not_compared():
    assert shifts([day(n, 0.2) for n in range(7)] + [day(7, 5)], "day") == []


def test_not_enough_history_means_no_finding():
    assert shifts([day(0, 10), day(1, 10), day(2, 40)], "day") == []
    assert shifts([day(0, 10), day(1, 10), day(2, 10), day(3, 40)], "day")  # con 3 previos sí


def test_gaps_are_not_zeros_and_do_not_shift_the_baseline():
    periods = [day(0, 10), day(2, 10), day(5, 10), day(9, 10), day(12, 25)]  # días sin lecturas simplemente no existen
    assert shifts(periods, "day")[0].baseline_kwh == D("10.00")


def test_days_with_poor_coverage_are_ignored_as_history_and_as_subject():
    periods = [day(n, 10) for n in range(5)] + [day(5, 1, coverage=0.2)] + [day(6, 30, coverage=0.3)]
    assert shifts(periods, "day") == []


def test_only_periods_since_the_horizon_are_evaluated():
    periods = [day(n, 10) for n in range(7)] + [day(7, 25)]
    assert ae.detect_shifts(periods, source="readings", granularity="day", th=TH, since=D0 + timedelta(days=8)) == []


# ---------- aumentos y caídas (mes / factura) ----------
def test_monthly_increase_warning_and_critical_by_rate():
    base = [month(i, 300) for i in range(4)]
    assert shifts(base + [month(4, 440)], "month") == []                       # +46.7 %
    warn = shifts(base + [month(4, 450)], "month")[0]
    assert (warn.kind, warn.severity, warn.delta_pct) == ("increase", "warning", D("50.00"))
    assert shifts(base + [month(4, 600)], "month")[0].severity == "critical"
    assert warn.baseline_kwh == D("300.00") and "50" in warn.explanation


def test_comparison_is_by_rate_so_a_shorter_covered_period_is_not_a_drop():
    base = [month(i, 300) for i in range(4)]
    assert shifts(base + [month(4, 150, days=15, coverage=0.5)], "month") == []   # mismo ritmo: 10 kWh/día
    (f,) = shifts(base + [month(4, 225, days=15, coverage=0.5)], "month")           # 15 kWh/día = +50 %
    assert f.kind == "increase" and f.baseline_kwh == D("150.00") and f.observed_kwh == D("225.00") and f.days == D("15.00")


def test_drops_are_info_or_warning_never_critical():
    base = [month(i, 300) for i in range(4)]
    info = shifts(base + [month(4, 170)], "month")[0]
    assert (info.kind, info.severity) == ("drop", "info") and info.delta_pct == D("-43.33")
    assert shifts(base + [month(4, 60)], "month")[0].severity == "warning"
    assert shifts(base + [month(4, 0)], "month")[0].severity == "warning"           # 0 kWh en un mes completo
    assert shifts(base + [month(4, 200)], "month") == []                              # -33 % no es caída


def test_a_single_day_drop_is_not_flagged():
    assert shifts([day(n, 10) for n in range(7)] + [day(7, 1)], "day") == []


def test_the_baseline_is_the_median_so_one_outlier_does_not_distort_it():
    periods = [month(0, 300), month(1, 900), month(2, 300), month(3, 300), month(4, 450)]
    assert shifts(periods, "month")[-1].baseline_kwh == D("300.00") and len(shifts(periods, "month")) >= 1


def test_estimated_data_lowers_confidence():
    base = [month(i, 300) for i in range(5)]
    real = shifts(base + [month(5, 700)], "month")[0].confidence
    guess = shifts(base + [ae.Period(month(5, 700).start, month(5, 700).end, D(700), D(30), D(1), True)], "month")[0].confidence
    assert (real, guess) == ("high", "medium")


# ---------- facturas ----------
def bill(offset, kwh, days=30):
    start = date(2025, 1, 1) + timedelta(days=30 * offset)
    return NS(id=uuid4(), period_start=start, period_end=start + timedelta(days=days - 1), kwh=D(str(kwh)), days=days)


def test_bills_are_compared_by_billed_days_and_carry_their_bill_id():
    bills = [bill(i, 300) for i in range(4)] + [bill(4, 600, days=30)]
    findings = ae.detect_shifts(ae.periods_from_bills(bills), source="bills", granularity="billing", th=TH, since=date(2024, 1, 1))
    (f,) = findings
    assert f.kind == "increase" and f.source == "bills" and f.bill_id == bills[-1].id and f.severity == "critical"
    assert "la factura del" in f.explanation and f.confidence in ("medium", "high")


def test_a_longer_bill_with_the_same_daily_rate_is_normal():
    bills = [bill(i, 300) for i in range(4)] + [bill(4, 330, days=33)]
    assert ae.detect_shifts(ae.periods_from_bills(bills), source="bills", granularity="billing", th=TH, since=date(2024, 1, 1)) == []


def test_bills_with_zero_days_are_ignored():
    assert ae.periods_from_bills([bill(0, 100, days=0)]) == []


# ---------- confianza ----------
def test_confidence_points_are_explicit():
    f = ae.confidence_for
    assert f(history_n=6, coverage=D(1), estimated=False, spread=D("0.1"), magnitude_ratio=D(2)) == "high"
    assert f(history_n=3, coverage=D(1), estimated=False, spread=D("0.1"), magnitude_ratio=D(2)) == "medium"   # 4 puntos
    assert f(history_n=3, coverage=D("0.6"), estimated=True, spread=D("0.5"), magnitude_ratio=D(1)) == "low"
    assert f(history_n=4, coverage=D(1), estimated=False, spread=D("0.1"), magnitude_ratio=D(1)) == "medium"


# ---------- nocturno ----------
def at(n, hour, minute=0):
    return datetime(2026, 9, 1, tzinfo=TZ) + timedelta(days=n, hours=hour, minutes=minute)


def meter(days, night_kwh, special=None):
    """Lecturas a las 23:00 y 05:00 de cada día: día = 0.5 kWh/h (9 kWh en 18 h), noche = `night_kwh` en 6 h."""
    points, total = [cc.MeterPoint(at(0, 5), D(0))], D(0)
    for n in range(days):
        total += D(9)
        points.append(cc.MeterPoint(at(n, 23), total))
        total += D(str((special or {}).get(n, night_kwh)))
        points.append(cc.MeterPoint(at(n + 1, 5), total))
    return cc.intervals_from_readings(points)


def night(intervals, th=TH, since=D0, ref=D0):
    return ae.detect_night(intervals, th=th, since=since, reference_since=ref)


def test_a_night_close_to_the_daily_rate_is_flagged_and_normal_nights_are_not():
    found = night(meter(14, 0.6, special={9: 2.4}))
    assert [f.period_start for f in found] == [D0 + timedelta(days=9)]
    f = found[0]
    assert (f.kind, f.source, f.granularity) == ("night", "readings", "day") and f.delta_pct is None
    assert f.observed_kwh == D("2.40") and f.period_end == f.period_start + timedelta(days=1)
    assert f.severity == "info" and "23:00" in f.explanation and "05:00" in f.explanation and "identificar cuál" in f.explanation
    assert f.evidence["hours"] == 6.0 and f.evidence["share"] < 1


def test_a_night_as_heavy_as_the_day_is_a_warning():
    (f,) = night(meter(14, 0.6, special={9: 4.0}))
    assert f.severity == "warning" and f.evidence["share"] >= 1


def test_repeated_heavy_nights_raise_confidence():
    many = night(meter(14, 0.6, special={9: 2.4, 10: 2.4, 11: 2.5, 12: 2.4}))
    one = night(meter(14, 0.6, special={9: 2.4}))
    assert ae.CONFIDENCE_RANK[many[-1].confidence] > ae.CONFIDENCE_RANK[one[0].confidence]


def test_without_enough_reference_there_is_no_night_finding():
    assert night(meter(2, 3.0)) == []


def test_daytime_readings_only_give_no_night_data():
    points = [cc.MeterPoint(at(n, 8), D(n * 10)) for n in range(20)]
    assert night(cc.intervals_from_readings(points)) == []


def test_a_short_night_window_is_ignored():
    pts = [cc.MeterPoint(at(0, 8), D(0))]
    total = D(0)
    for n in range(10):
        total += D(8)
        pts.append(cc.MeterPoint(at(n, 23), total))
        total += D(2) if n == 5 else D("0.1")
        pts.append(cc.MeterPoint(at(n + 1, 0, 30), total))   # solo 1.5 h dentro de la noche
        total += D("0.1")
        pts.append(cc.MeterPoint(at(n + 1, 8), total))
    assert night(cc.intervals_from_readings(pts), th=ae.Thresholds(night_min_hours=D(2))) == []
    assert night(cc.intervals_from_readings(pts), th=ae.Thresholds(night_min_hours=D(1))) != []


# ---------- deduplicación entre fuentes ----------
def finding(source, confidence, start=date(2026, 8, 1), end=date(2026, 8, 31), kind="increase"):
    return ae.Finding(kind, source, "billing" if source == "bills" else "month", "warning", confidence, start, end, D(1), D(1), D(60), D(30), "x")


def test_overlapping_signals_from_two_sources_keep_the_more_confident_and_bills_on_ties():
    bills_f, readings_f = finding("bills", "medium"), finding("readings", "medium")
    assert ae.drop_overlaps([readings_f, bills_f]) == [bills_f]
    assert ae.drop_overlaps([bills_f, readings_f]) == [bills_f]
    strong = finding("readings", "high")
    assert ae.drop_overlaps([bills_f, strong]) == [strong]
    other_month = finding("readings", "high", date(2026, 6, 1), date(2026, 6, 30))
    assert len(ae.drop_overlaps([bills_f, other_month])) == 2
    assert len(ae.drop_overlaps([finding("bills", "low", kind="drop"), finding("readings", "low")])) == 2


# ---------- umbrales ----------
def test_thresholds_are_validated_and_read_from_settings():
    for bad in (dict(increase_warning_pct=D(100), increase_critical_pct=D(50)), dict(drop_info_pct=D(80), drop_warning_pct=D(40)),
                dict(peak_warning_pct=D(0)), dict(min_history=1)):
        with pytest.raises(ValueError):
            ae.Thresholds(**bad)
    from app.config import settings
    assert ae.Thresholds.from_settings(settings) == ae.Thresholds()
