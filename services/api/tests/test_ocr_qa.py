"""ERD-OCR-REAL-QA: el arnés de evaluación distingue acierto, vacío detectado y error silencioso."""
import json

import pytest

from app.schemas.ocr import OcrDraft, OcrField
from app.services.ocr import qa


def draft(**fields):
    base = {name: OcrField(value=None, confidence="none") for name in qa.FIELDS}
    for name, (value, confidence) in fields.items():
        base[name] = OcrField(value=value, confidence=confidence)
    return OcrDraft(**base, warnings=[], raw_text_excerpt="")


EXPECTED = {"period_start": "2026-09-01", "period_end": "2026-09-30", "days": "30", "kwh": "320", "amount_dop": "4500.00"}


def test_exact_and_numerically_equal_values_are_ok():
    result = qa.evaluate(draft(period_start=("2026-09-01", "high"), period_end=("2026-09-30", "high"),
                               days=("30", "high"), kwh=("320.00", "high"), amount_dop=("4500", "inferred")), EXPECTED)
    assert {f.status for f in result.fields} == {"ok"} and not result.silent_errors


def test_missing_value_is_reported_but_not_a_silent_error():
    result = qa.evaluate(draft(kwh=("320", "high")), EXPECTED)
    statuses = {f.name: f.status for f in result.fields}
    assert statuses["kwh"] == "ok" and statuses["amount_dop"] == "missing"
    assert not result.silent_errors


def test_wrong_value_with_high_confidence_is_a_silent_error():
    result = qa.evaluate(draft(kwh=("302", "high")), EXPECTED)
    assert [f.name for f in result.silent_errors] == ["kwh"]


def test_wrong_value_flagged_as_inferred_is_detected_not_silent():
    result = qa.evaluate(draft(period_end=("2026-09-29", "inferred")), EXPECTED)
    field = next(f for f in result.fields if f.name == "period_end")
    assert field.status == "wrong_flagged" and not result.silent_errors


def test_fields_without_ground_truth_are_not_scored():
    result = qa.evaluate(draft(kwh=("320", "high")), {"kwh": "320"})
    assert [f.name for f in result.fields] == ["kwh"]


def test_summary_aggregates_per_distributor_and_fails_on_silent_errors(tmp_path):
    good = qa.evaluate(draft(kwh=("320", "high")), {"kwh": "320"})
    bad = qa.evaluate(draft(kwh=("1", "high")), {"kwh": "320"})
    report = qa.summarize({"a.jpg": ("EDESUR", good), "b.jpg": ("EDESUR", bad), "c.jpg": ("EDEESTE", good)})
    assert report["by_distributor"]["EDESUR"] == {"files": 2, "ok": 1, "missing": 0, "wrong_flagged": 0, "wrong_silent": 1}
    assert report["by_distributor"]["EDEESTE"]["ok"] == 1
    assert report["silent_errors"] == [{"file": "b.jpg", "field": "kwh", "expected": "320", "got": "1"}]
    assert report["passed"] is False


def test_load_manifest_rejects_unknown_distributor_and_fields(tmp_path):
    path = tmp_path / "expected.json"
    path.write_text(json.dumps({"a.jpg": {"distributor": "OTRA", "kwh": "1"}}))
    with pytest.raises(ValueError, match="distributor"):
        qa.load_manifest(path)
    path.write_text(json.dumps({"a.jpg": {"distributor": "EDESUR", "color": "x"}}))
    with pytest.raises(ValueError, match="color"):
        qa.load_manifest(path)


def test_run_directory_requires_every_file_in_manifest(tmp_path):
    (tmp_path / "expected.json").write_text(json.dumps({"a.jpg": {"distributor": "EDESUR", "kwh": "320"}}))
    with pytest.raises(FileNotFoundError, match="a.jpg"):
        qa.run_directory(tmp_path, reader=lambda raw: "")
