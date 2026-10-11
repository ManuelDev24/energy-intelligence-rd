"""ERD-OCR-REAL-QA (SIMULADO): facturas sintéticas con las etiquetas y la estructura de EDESUR, EDENORTE y EDEESTE, leídas con
Tesseract REAL, limpias y degradadas como una foto de celular. Todo dato es inventado (`tests/synthetic_bills.py`).

Garantiza lo único que se puede garantizar sin facturas reales nuevas: **ningún valor equivocado sale con confianza alta**.
No mide la calidad real de una foto de celular de verdad."""
import shutil

import pytest

from app.services.ocr import qa
from app.services.ocr.parser import parse_bill_text
from app.services.ocr.pipeline import TesseractEngine
from tests import synthetic_bills as sb

pytestmark = pytest.mark.skipif(shutil.which("tesseract") is None, reason="Tesseract no está instalado")

DATA = [sb.SAMPLE, sb.BillData(sb.date(2026, 6, 3), sb.date(2026, 7, 2), 9120, 9503, sb.date(2026, 7, 28)),
        sb.BillData(sb.date(2026, 7, 19), sb.date(2026, 8, 17), 310, 324, sb.date(2026, 9, 12))]
norm = lambda s: s.rstrip("0").rstrip(".") if "." in s else s  # noqa: E731


def read(distributor: str, data: sb.BillData, photo: bool):
    img = sb.render(distributor, data, 1800 if photo else 768)
    if photo:
        img = sb.photoize(img, seed=DATA.index(data) + 1)
    draft = parse_bill_text(TesseractEngine().read_image(img))
    exp = sb.expected(data)
    if distributor == "EDENORTE":  # la muestra real de EDENORTE no traía lecturas (consumo promediado)
        exp.pop("reading_previous"), exp.pop("reading_current")
    return draft, exp


def statuses(draft, exp):
    return {f: ("missing" if getattr(draft, f).value is None else "ok" if norm(getattr(draft, f).value) == norm(v)
                else "wrong_silent" if getattr(draft, f).confidence == "high" else "wrong_flagged") for f, v in exp.items()}


@pytest.mark.parametrize("distributor", ["EDESUR", "EDENORTE", "EDEESTE"])
def test_clean_synthetic_bills_are_read_completely_and_correctly(distributor):
    draft, exp = read(distributor, sb.SAMPLE, photo=False)
    assert statuses(draft, exp) == {f: "ok" for f in exp}


@pytest.mark.parametrize("distributor", ["EDESUR", "EDENORTE", "EDEESTE"])
def test_photo_like_synthetic_bills_never_give_a_wrong_value_with_high_confidence(distributor):
    results = [statuses(*read(distributor, d, photo=True)) for d in DATA[:2]]
    silent = [(i, f) for i, r in enumerate(results) for f, s in r.items() if s == "wrong_silent"]
    assert silent == []
    total = sum(len(r) for r in results)
    assert sum(1 for r in results for s in r.values() if s == "ok") >= total * 0.4   # recall mínimo, no una garantía de calidad


def test_the_qa_harness_reports_zero_silent_errors_on_the_synthetic_set(tmp_path):
    import json
    manifest = {}
    for distributor in ("EDESUR", "EDENORTE", "EDEESTE"):
        name = f"{distributor.lower()}-sintetica.png"
        (tmp_path / name).write_bytes(sb.to_bytes(sb.render(distributor, sb.SAMPLE, 768)))
        entry = {"distributor": distributor, **sb.expected(sb.SAMPLE)}
        if distributor == "EDENORTE":
            entry.pop("reading_previous"), entry.pop("reading_current")
        manifest[name] = entry
    (tmp_path / "expected.json").write_text(json.dumps(manifest))
    report = qa.run_directory(tmp_path)
    assert report["passed"] and report["silent_errors"] == []
    assert sum(row["ok"] for row in report["by_distributor"].values()) == 8 + 6 + 8
