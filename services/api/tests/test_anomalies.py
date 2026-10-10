from datetime import date, datetime, time
from decimal import Decimal

import pytest

from app.services.anomalies import detect_anomaly
from app.services.consumption_calc import Bucket, BucketResult, SANTO_DOMINGO


def bucket(day, kwh):
    start = date.fromisoformat(day)
    return BucketResult(
        bucket=Bucket(start, start, datetime.combine(start, time(), SANTO_DOMINGO),
                      datetime.combine(start, time(), SANTO_DOMINGO)),
        kwh=None if kwh is None else Decimal(str(kwh)), quality="REAL" if kwh is not None else None,
        coverage_ratio=Decimal("1") if kwh is not None else Decimal("0"),
        covered_seconds=Decimal("86400") if kwh is not None else Decimal("0"),
        reason_code=None, reason=None,
    )


def test_detects_current_bucket_against_median_baseline_with_explanation():
    result = detect_anomaly(
        [bucket("2026-09-01", 10), bucket("2026-09-02", 11), bucket("2026-09-03", 9), bucket("2026-09-04", 20)],
        minimum_history=3, warning_delta_pct=Decimal("50"), critical_delta_pct=Decimal("101"),
    )
    assert result is not None
    assert result.severity == "warning"
    assert result.observed_kwh == Decimal("20")
    assert result.baseline_kwh == Decimal("10")
    assert result.delta_pct == Decimal("100.00")
    assert result.period_start == date(2026, 9, 4)
    assert "consumo" in result.explanation.lower()


@pytest.mark.parametrize("buckets", [
    [bucket("2026-09-01", 10), bucket("2026-09-02", 20)],
    [bucket("2026-09-01", 0), bucket("2026-09-02", 0), bucket("2026-09-03", 10), bucket("2026-09-04", 30)],
    [bucket("2026-09-01", 10), bucket("2026-09-02", 11), bucket("2026-09-03", 9), bucket("2026-09-04", 10)],
    [bucket("2026-09-01", 10), bucket("2026-09-02", None), bucket("2026-09-03", 11), bucket("2026-09-04", 20)],
])
def test_returns_no_anomaly_without_sufficient_comparable_nonzero_history(buckets):
    assert detect_anomaly(buckets) is None


def test_classifies_critical_when_delta_reaches_critical_threshold():
    result = detect_anomaly(
        [bucket("2026-09-01", 10), bucket("2026-09-02", 10), bucket("2026-09-03", 10), bucket("2026-09-04", 21)],
        warning_delta_pct=Decimal("50"), critical_delta_pct=Decimal("100"),
    )
    assert result is not None and result.severity == "critical"
