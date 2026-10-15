"""ERD-OCR-REAL-QA: variantes de imagen y selección de la mejor lectura (sin Tesseract: el motor se sustituye)."""
import pytest
from PIL import Image

from app.services.ocr import pipeline, preprocess

GOOD = ("PERIODO DE FACTURACION\n01/09/2026 - 30/09/2026 = 30 días\nCONSUMO 320 kWh\nTOTAL A PAGAR RD$ 4,500.00\n"
        "FECHA LIMITE DE PAGO 15/10/2026\nLectura anterior: 1000\nLectura actual: 1320\n")


def test_small_images_are_enlarged_and_large_ones_are_left_alone():
    small = Image.new("RGB", (768, 1024), (255, 255, 255))
    (_, _, first), *_ = list(preprocess.variants(small))
    assert 2.4 <= max(first.size) / 1024 <= 2.6 and first.mode == "L"
    big = Image.new("RGB", (3000, 4000), (255, 255, 255))
    (_, _, big_first), *_ = list(preprocess.variants(big))
    assert big_first.size == (3000, 4000)


def test_colored_backgrounds_become_light_and_black_text_stays_dark():
    img = Image.new("RGB", (200, 100), (255, 217, 0))           # amarillo: su canal azul es 0
    img.paste((0, 0, 0), (50, 40, 150, 60))                      # «texto» negro
    gray = preprocess._brightness(img)
    assert gray.getpixel((10, 10)) > 200 and gray.getpixel((100, 50)) < 30
    blue = Image.new("RGB", (50, 50), (157, 195, 230))
    assert preprocess._brightness(blue).getpixel((5, 5)) > 200


def test_passes_are_tried_in_the_documented_order_and_images_are_built_lazily():
    names = [(n, psm) for n, psm, _ in preprocess.variants(Image.new("L", (800, 800), 255))]
    assert names == [("brillo", 4), ("brillo", 6), ("fondo plano", 4), ("brillo", 3)]


def test_score_counts_fields_and_penalizes_contradictions():
    assert preprocess.score_text(GOOD) == 7
    assert preprocess.score_text("nada útil") == 0
    contradictory = "PERIODO DE FACTURACION\n01/09/2026 - 30/09/2026 = 12 días\nTOTAL A PAGAR RD$ 10.00\n"
    assert preprocess.score_text(contradictory) < preprocess.score_text(contradictory.replace("12 días", "30 días"))


class FakeTesseract(pipeline.TesseractEngine):
    def __init__(self, outputs):
        self.outputs, self.calls = list(outputs), []

    def _run(self, image, psm, timeout):
        self.calls.append(psm)
        out = self.outputs.pop(0)
        if isinstance(out, Exception):
            raise out
        return out


def img():
    return Image.new("RGB", (800, 600), (255, 255, 255))


def test_the_best_reading_wins_and_a_good_enough_one_stops_the_search():
    engine = FakeTesseract(["poco", GOOD, "no se debería pedir"])
    assert engine.read_image(img()) == GOOD
    assert engine.calls == [4, 6]                                # score 7 ≥ 6: no se prueban las demás


def test_when_nothing_is_good_it_tries_every_variant_and_returns_the_best():
    partial = "PERIODO DE FACTURACION\n01/09/2026 - 30/09/2026 = 30 días\n"
    engine = FakeTesseract(["", partial, "x", ""])
    assert engine.read_image(img()) == partial
    assert engine.calls == [4, 6, 4, 3]


def test_a_failing_first_pass_is_an_engine_error_but_later_failures_are_skipped():
    with pytest.raises(pipeline.EngineError):
        FakeTesseract([pipeline.EngineError("RuntimeError")]).read_image(img())
    first = "PERIODO DE FACTURACION\n01/09/2026 - 30/09/2026 = 30 días\nCONSUMO 320 kWh\n"
    engine = FakeTesseract([first, pipeline.EngineError("RuntimeError"), "", ""])
    assert engine.read_image(img()) == first and len(engine.calls) == 4


def test_the_time_budget_stops_extra_passes(monkeypatch):
    clock = iter([0.0, 0.0, 100.0, 100.0, 100.0])               # tras la 1.ª pasada ya no queda presupuesto
    monkeypatch.setattr(pipeline.time, "monotonic", lambda: next(clock))
    engine = FakeTesseract(["poco", "no se pide", "no se pide", "no se pide"])
    assert engine.read_image(img()) == "poco" and engine.calls == [4]
