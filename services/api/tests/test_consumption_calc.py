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


# ---------- auditoría C-13: allocate en O(n+m), mismo resultado que el recorrido completo ----------
def _allocate_reference(intervals, buckets):
    """El `allocate` anterior (O(intervalos × buckets)), conservado como oráculo: el nuevo debe dar exactamente lo mismo."""
    out = []
    for b in buckets:
        kwh = D(0)
        covered = D(0)
        touched = split = False
        for i in intervals:
            lo, hi = max(i.start, b.start_at), min(i.end, b.end_at)
            if hi <= lo:
                continue
            total = cc._micros(i.end - i.start)
            kwh += i.kwh * cc._micros(hi - i.start) / total - i.kwh * cc._micros(lo - i.start) / total
            covered += cc._micros(hi - lo)
            touched = True
            split = split or i.start < b.start_at or i.end > b.end_at
        span = cc._micros(b.end_at - b.start_at)
        ratio = covered / span
        if not touched:
            out.append(cc.BucketResult(b, None, None, D(0), D(0), "no_coverage", cc.NO_COVERAGE))
            continue
        partial = ratio < 1
        out.append(cc.BucketResult(b, kwh, "ESTIMATED" if split else "REAL", ratio, covered / 1_000_000,
                                   "partial_coverage" if partial else None, cc.PARTIAL_COVERAGE if partial else None))
    return out


def _random_readings(rng, count, start=datetime(2025, 1, 1, 8, tzinfo=TZ)):
    moment, value, points = start, D("1000"), []
    for _ in range(count):
        points.append(cc.MeterPoint(read_at=moment, reading_kwh=value))
        moment += timedelta(hours=rng.choice([1, 5, 23, 24, 24, 24, 30, 49, 72, 400]), minutes=rng.choice([0, 0, 17, 45]))
        value += D(str(round(rng.uniform(0, 40), 2)))
    return points


@pytest.mark.parametrize("seed", range(12))
@pytest.mark.parametrize("granularity", ["day", "week", "month"])
def test_allocate_equals_the_full_scan_on_random_readings(seed, granularity):
    import random
    rng = random.Random(seed)
    intervals = cc.intervals_from_readings(_random_readings(rng, rng.choice([2, 3, 15, 80])))
    first = date(2024, 12, 20) + timedelta(days=rng.randrange(0, 40))
    buckets = cc.calendar_buckets(granularity, first, first + timedelta(days=rng.choice([10, 60, 200, 366])), TZ)
    assert cc.allocate(intervals, buckets) == _allocate_reference(intervals, buckets)


def test_allocate_handles_overlapping_intervals_and_unsorted_input_like_before():
    a = cc.Interval(at(2026, 9, 1), at(2026, 9, 3), D("20"))
    b = cc.Interval(at(2026, 9, 2), at(2026, 9, 4), D("30"))  # solapa con a: no sale de lecturas consecutivas
    buckets = cc.calendar_buckets("day", date(2026, 9, 1), date(2026, 9, 4), TZ)
    assert cc.allocate([b, a], buckets) == _allocate_reference([b, a], buckets)
    assert cc.allocate([a, b], list(reversed(buckets))) == _allocate_reference([a, b], list(reversed(buckets)))


def test_a_year_of_daily_readings_is_allocated_within_the_performance_budget():
    """Antes ≈0,3 s por reparto (se hacían 3 por petición: ≈0,9 s). Presupuesto holgado para no ser frágil en CI."""
    import time
    start = at(2025, 6, 1, 12)
    points = [cc.MeterPoint(read_at=start + timedelta(days=d), reading_kwh=D(1000 + 7 * d)) for d in range(731)]
    intervals = cc.intervals_from_readings(points)
    buckets = cc.calendar_buckets("day", date(2025, 6, 1), date(2026, 5, 31), TZ)
    begun = time.perf_counter()
    results = cc.allocate(intervals, buckets)
    elapsed = time.perf_counter() - begun
    assert len(results) == 365 and all(r.kwh is not None for r in results)
    assert elapsed < 0.15, f"allocate tardó {elapsed:.3f}s con 365 buckets × 730 intervalos"
