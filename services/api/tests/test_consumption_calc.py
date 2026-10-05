"""Consumo desde lecturas de medidor (cálculo puro, sin base de datos)."""
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal as D

import pytest

from app.services import consumption_calc as cc

TZ = cc.SANTO_DOMINGO


def at(y, m, d, h=0, minute=0):
    return datetime(y, m, d, h, minute, tzinfo=TZ)


def pts(*pairs):
    return [cc.MeterPoint(read_at=t, reading_kwh=D(str(v))) for t, v in pairs]


# ---------- zona horaria ----------
def test_santo_domingo_is_utc_minus_4_without_dst():
    for month in (1, 7):
        assert datetime(2026, month, 1, tzinfo=TZ).utcoffset() == timedelta(hours=-4)


# ---------- intervalos ----------
def test_intervals_are_consecutive_deltas_sorted_by_time():
    out = cc.intervals_from_readings(pts((at(2026, 9, 3), 130), (at(2026, 9, 1), 100), (at(2026, 9, 2), 110)))
    assert [(i.start, i.end, i.kwh) for i in out] == [
        (at(2026, 9, 1), at(2026, 9, 2), D("10")), (at(2026, 9, 2), at(2026, 9, 3), D("20"))]


def test_intervals_need_two_readings():
    assert cc.intervals_from_readings(pts((at(2026, 9, 1), 100))) == []
    assert cc.intervals_from_readings([]) == []


def test_decreasing_readings_rejected_meter_replacement_not_supported():
    with pytest.raises(ValueError):
        cc.intervals_from_readings(pts((at(2026, 9, 1), 100), (at(2026, 9, 2), 90)))


def test_duplicate_timestamps_and_naive_datetimes_rejected():
    with pytest.raises(ValueError):
        cc.intervals_from_readings(pts((at(2026, 9, 1), 100), (at(2026, 9, 1), 100)))
    with pytest.raises(ValueError):
        cc.intervals_from_readings(pts((datetime(2026, 9, 1), 100), (at(2026, 9, 2), 110)))


# ---------- buckets de calendario ----------
def test_day_buckets_are_local_midnights_inclusive_range():
    b = cc.calendar_buckets("day", date(2026, 9, 1), date(2026, 9, 3), TZ)
    assert [(x.start, x.end) for x in b] == [(date(2026, 9, 1), date(2026, 9, 1)), (date(2026, 9, 2), date(2026, 9, 2)),
                                             (date(2026, 9, 3), date(2026, 9, 3))]
    assert b[0].start_at == at(2026, 9, 1) and b[0].end_at == at(2026, 9, 2)
    assert b[0].start_at.utcoffset() == timedelta(hours=-4)


def test_week_buckets_are_iso_monday_weeks_clipped_to_range():
    # 2026-09-02 es miércoles; 2026-09-07 es lunes.
    b = cc.calendar_buckets("week", date(2026, 9, 2), date(2026, 9, 15), TZ)
    assert [(x.start, x.end) for x in b] == [(date(2026, 9, 2), date(2026, 9, 6)), (date(2026, 9, 7), date(2026, 9, 13)),
                                             (date(2026, 9, 14), date(2026, 9, 15))]


def test_month_buckets_clipped_to_range():
    b = cc.calendar_buckets("month", date(2026, 1, 15), date(2026, 3, 10), TZ)
    assert [(x.start, x.end) for x in b] == [(date(2026, 1, 15), date(2026, 1, 31)), (date(2026, 2, 1), date(2026, 2, 28)),
                                             (date(2026, 3, 1), date(2026, 3, 10))]


def test_invalid_bucket_requests_rejected():
    with pytest.raises(ValueError):
        cc.calendar_buckets("hour", date(2026, 1, 1), date(2026, 1, 2), TZ)
    with pytest.raises(ValueError):
        cc.calendar_buckets("day", date(2026, 1, 2), date(2026, 1, 1), TZ)


# ---------- asignación ----------
def test_interval_entirely_inside_bucket_is_real_with_full_coverage():
    ints = cc.intervals_from_readings(pts((at(2026, 9, 1), 100), (at(2026, 9, 2), 112.5)))
    [r] = cc.allocate(ints, cc.calendar_buckets("day", date(2026, 9, 1), date(2026, 9, 1), TZ))
    assert (r.kwh, r.quality, r.coverage_ratio, r.reason_code) == (D("12.5"), "REAL", D("1"), None)


def test_interval_spanning_buckets_is_split_proportionally_and_estimated():
    # 48 h, 30 kWh, empieza el 1 a las 12:00 -> 12 h en día 1, 24 h en día 2, 12 h en día 3.
    ints = cc.intervals_from_readings(pts((at(2026, 9, 1, 12), 0), (at(2026, 9, 3, 12), 30)))
    out = cc.allocate(ints, cc.calendar_buckets("day", date(2026, 9, 1), date(2026, 9, 3), TZ))
    assert [r.kwh for r in out] == [D("7.5"), D("15"), D("7.5")]
    assert {r.quality for r in out} == {"ESTIMATED"}
    assert [r.coverage_ratio for r in out] == [D("0.5"), D("1"), D("0.5")]
    assert out[0].reason_code == "partial_coverage" and out[1].reason_code is None


def test_bucket_without_covering_interval_has_no_value_never_zero():
    ints = cc.intervals_from_readings(pts((at(2026, 9, 1), 100), (at(2026, 9, 2), 110)))
    out = cc.allocate(ints, cc.calendar_buckets("day", date(2026, 9, 1), date(2026, 9, 2), TZ))
    assert out[1].kwh is None and out[1].quality is None and out[1].coverage_ratio == 0
    assert out[1].reason_code == "no_coverage" and out[1].reason


def test_zero_consumption_with_coverage_is_real_zero():
    ints = cc.intervals_from_readings(pts((at(2026, 9, 1), 100), (at(2026, 9, 2), 100)))
    [r] = cc.allocate(ints, cc.calendar_buckets("day", date(2026, 9, 1), date(2026, 9, 1), TZ))
    assert r.kwh == D("0") and r.quality == "REAL"


def test_partial_bucket_with_whole_intervals_stays_real_but_reports_coverage():
    ints = cc.intervals_from_readings(pts((at(2026, 9, 1, 6), 100), (at(2026, 9, 1, 18), 106)))
    [r] = cc.allocate(ints, cc.calendar_buckets("day", date(2026, 9, 1), date(2026, 9, 1), TZ))
    assert (r.kwh, r.quality, r.coverage_ratio, r.reason_code) == (D("6"), "REAL", D("0.5"), "partial_coverage")


def test_utc_readings_are_bucketed_in_local_time():
    # 2026-09-02 03:00 UTC = 2026-09-01 23:00 local: pertenece al día 1 local.
    utc = timezone.utc
    ints = cc.intervals_from_readings([cc.MeterPoint(datetime(2026, 9, 1, 4, tzinfo=utc), D("0")),
                                       cc.MeterPoint(datetime(2026, 9, 2, 3, tzinfo=utc), D("23"))])
    out = cc.allocate(ints, cc.calendar_buckets("day", date(2026, 9, 1), date(2026, 9, 2), TZ))
    assert out[0].kwh == D("23") and out[0].quality == "REAL" and out[1].kwh is None


# ---------- resumen ----------
def test_summary_totals_average_and_peak():
    ints = cc.intervals_from_readings(pts((at(2026, 9, 1), 0), (at(2026, 9, 2), 10), (at(2026, 9, 3), 40)))
    out = cc.allocate(ints, cc.calendar_buckets("day", date(2026, 9, 1), date(2026, 9, 4), TZ))
    s = cc.summarize(out)
    assert s.total_kwh == D("40") and s.total_quality == "REAL"
    assert s.covered_days == D("2") and s.coverage_ratio == D("0.5")
    assert s.avg_daily_kwh == D("20")
    assert s.peak.bucket.start == date(2026, 9, 2) and s.peak.kwh == D("30")


def test_summary_is_estimated_if_any_bucket_estimated():
    ints = cc.intervals_from_readings(pts((at(2026, 9, 1, 12), 0), (at(2026, 9, 2, 12), 24)))
    s = cc.summarize(cc.allocate(ints, cc.calendar_buckets("day", date(2026, 9, 1), date(2026, 9, 2), TZ)))
    assert s.total_kwh == D("24") and s.total_quality == "ESTIMATED"


def test_summary_without_data_returns_none_not_zero():
    s = cc.summarize(cc.allocate([], cc.calendar_buckets("day", date(2026, 9, 1), date(2026, 9, 2), TZ)))
    assert s.total_kwh is None and s.avg_daily_kwh is None and s.peak is None and s.covered_days == 0


def test_peak_tie_keeps_earliest_bucket():
    ints = cc.intervals_from_readings(pts((at(2026, 9, 1), 0), (at(2026, 9, 2), 5), (at(2026, 9, 3), 10)))
    s = cc.summarize(cc.allocate(ints, cc.calendar_buckets("day", date(2026, 9, 1), date(2026, 9, 2), TZ)))
    assert s.peak.bucket.start == date(2026, 9, 1)


def test_allocation_conserves_interval_energy_across_many_buckets():
    ints = cc.intervals_from_readings(pts((at(2026, 1, 10, 7), 0), (at(2026, 3, 20, 19), D("1234.56"))))
    out = cc.allocate(ints, cc.calendar_buckets("day", date(2026, 1, 1), date(2026, 3, 31), TZ))
    assert sum(r.kwh for r in out if r.kwh is not None) == D("1234.56")
