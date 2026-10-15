"""Regresiones OCR sintéticas: no contienen texto ni cifras de facturas privadas."""
from app.services.ocr.parser import parse_bill_text
from app.services.ocr import pipeline
from PIL import Image


class ReplayEngine(pipeline.TesseractEngine):
    def __init__(self, outputs):
        self.outputs = iter(outputs)
        self.calls = 0

    def _run(self, image, psm, timeout):
        self.calls += 1
        return next(self.outputs)


def read(outputs):
    engine = ReplayEngine(outputs)
    text = engine.read_image(Image.new("L", (200, 200), 255))
    return parse_bill_text(text), engine


def test_complementary_variants_preserve_the_complete_period_group():
    period = "03/02/2026 - 05/03/2026 = 30 días\nTOTAL A PAGAR RD$ 777.31\n"
    readings = ("Activa B.T. 88776655 8,200 8,260 1.00\n"
                "TOTAL A PAGAR RD$ 777.31\nFECHA LIMITE PAGO 18/03/2026\n")
    draft, engine = read([period, readings, "", ""])
    assert (draft.period_start.value, draft.period_end.value, draft.days.value) == ("2026-02-03", "2026-03-05", "30")
    assert draft.reading_previous.value == "8200.00"
    assert draft.due_date.value == "2026-03-18"
    assert engine.calls == 4



def test_inferred_fields_do_not_stop_the_variant_search_early():
    uncertain = ("03/02/2026 - 05/03/2026 = 30 días\nIMPORTE TOTAL RD$ 777.31\n"
                 "Activa B.T. 88776655 8,200 8,260 1.00\n")
    draft, engine = read([uncertain, uncertain + "FECHA LIMITE PAGO 18/03/2026\n", "", ""])
    assert draft.due_date.value == "2026-03-18"
    assert engine.calls == 4


def test_unconfirmed_month_amount_has_an_explicit_review_warning():
    draft = parse_bill_text("FACTURADO DE JUN RD$ 777.31\n")
    assert draft.amount_dop.confidence == "inferred"
    assert any("facturado" in warning and "compárelo" in warning for warning in draft.warnings)


def test_a_coherent_period_overrides_a_richer_contradictory_variant():
    damaged = ("03/02/2026 - 06/03/2026 = 30 días\nTOTAL A PAGAR RD$ 777.31\n"
               "Activa B.T. 88776655 8,200 8,260 1.00\nFECHA LIMITE PAGO 18/03/2026\n")
    coherent = "03/02/2026 - 05/03/2026 = 30 días\n"
    draft, _ = read([damaged, coherent, "", ""])
    assert (draft.period_start.value, draft.period_end.value, draft.days.value) == ("2026-02-03", "2026-03-05", "30")
    assert draft.period_end.confidence == "inferred"
    assert any("variantes" in warning for warning in draft.warnings)


def test_printed_energy_tiers_are_not_displaced_by_a_damaged_reading_row():
    draft = parse_bill_text("Activa B.T. 88776655 8,200 8,211 1.00\n"
                            "200 kWh X RD$ 4.10 RD$ 820.00\n30 kWh X RD$ 6.20 RD$ 186.00\n")
    assert draft.kwh.value == "230.00"
    assert draft.reading_previous.value is None
    assert draft.reading_current.value is None
    assert any("lecturas" in warning and "no coinciden" in warning for warning in draft.warnings)


def test_repeated_month_amount_beats_one_richer_misread_without_becoming_high():
    common = "03/02/2026 - 05/03/2026 = 30 días\nFECHA LIMITE PAGO 18/03/2026\n"
    rich = common + "FACTURADO DE JUN RD$ 77.31\n60 kWh X RD$ 4.10 RD$ 246.00\n"
    repeated = common + "FACTURADO DE JUN RD$ 777.31\n"
    draft, _ = read([rich, repeated, repeated, ""])
    assert draft.amount_dop.value == "777.31"
    assert draft.amount_dop.confidence == "inferred"
    assert any("variantes" in warning and "amount_dop" in warning for warning in draft.warnings)


def test_a_partial_tier_subtotal_does_not_disprove_a_larger_reading_delta():
    draft = parse_bill_text("Activa B.T. 88776655 8,200 8,630 1.00\n"
                            "30 kWh X RD$ 6.20 RD$ 186.00\n")
    assert draft.kwh.value == "430.00"
    assert draft.kwh.confidence == "inferred"
    assert (draft.reading_previous.value, draft.reading_current.value) == ("8200.00", "8630.00")
    assert any("parcial" in warning for warning in draft.warnings)


def test_recovered_amount_keeps_its_source_warning_not_a_missing_warning():
    primary = ("03/02/2026 - 05/03/2026 = 30 días\nCONSUMO 60 kWh\n"
               "Lectura anterior: 8200\nLectura actual: 8260\nFECHA LIMITE PAGO 18/03/2026\n")
    draft, _ = read([primary, "IMPORTE EN RD$ 777.31\n", "", ""])
    assert draft.amount_dop.value == "777.31"
    assert draft.amount_dop.confidence == "inferred"
    assert any("una sola vez" in warning for warning in draft.warnings)
    assert not any("No se encontró el monto" in warning for warning in draft.warnings)


def test_tied_unconfirmed_amounts_are_left_for_manual_review():
    common = "03/02/2026 - 05/03/2026 = 30 días\nFECHA LIMITE PAGO 18/03/2026\n"
    rich = common + "FACTURADO DE JUN RD$ 77.31\n60 kWh X RD$ 4.10 RD$ 246.00\n"
    alternative = common + "FACTURADO DE JUN RD$ 777.31\n"
    draft, _ = read([rich, alternative, alternative, rich])
    assert draft.amount_dop.value is None
    assert draft.amount_dop.confidence == "none"
    assert any("variantes" in warning and "amount_dop" in warning for warning in draft.warnings)


def test_a_due_date_from_another_variant_is_checked_against_the_recovered_period():
    period = "03/02/2026 - 05/03/2026 = 30 días\nTOTAL A PAGAR RD$ 777.31\n"
    isolated = "FECHA LIMITE PAGO 18/03/2029\n"
    draft, _ = read([period, isolated, "", ""])
    assert draft.due_date.value is None
    assert any("fecha límite" in warning and "coherente" in warning for warning in draft.warnings)


def test_cross_variant_consumption_and_reading_disagreement_is_not_high_confidence():
    primary = ("03/02/2026 - 05/03/2026 = 30 días\nCONSUMO 60 kWh\n"
               "TOTAL A PAGAR RD$ 777.31\nFECHA LIMITE PAGO 18/03/2026\n")
    readings = "Lectura anterior: 8200\nLectura actual: 8261\n"
    draft, _ = read([primary, readings, "", ""])
    assert draft.kwh.confidence == "inferred"
    assert draft.reading_previous.confidence == "inferred"
    assert draft.reading_current.confidence == "inferred"
    assert any("lecturas" in warning and "no coinciden" in warning for warning in draft.warnings)


def test_amount_contradictions_are_penalized_in_variant_scoring():
    from app.services.ocr import preprocess
    concepts = "Cargo Fijo\n30 días RD$ 120.00 RD$ 120.00\n60 kWh X RD$ 4.10 RD$ 246.00\n"
    consistent = concepts + "FACTURADO DE JUN RD$ 366.00\n"
    contradictory = concepts + "FACTURADO DE JUN RD$ 466.00\n"
    assert preprocess.score_text(contradictory) < preprocess.score_text(consistent)


def test_a_malformed_current_reading_is_not_accepted_as_its_integer_prefix():
    draft = parse_bill_text("Activa B.T. 88776655 42 45,6 1.00\n")
    assert draft.reading_previous.value is None
    assert draft.reading_current.value is None
    assert draft.kwh.value is None


def test_scanned_pdf_keeps_variant_evidence_without_extra_ocr_passes():
    from tests.test_ocr_prod import text_pdf
    period = "03/02/2026 - 05/03/2026 = 30 días\n"
    readings = "Activa B.T. 88776655 8,200 8,260 1.00\n"
    payment = "TOTAL A PAGAR RD$ 777.31\nFECHA LIMITE PAGO 18/03/2026\n"
    engine = ReplayEngine([period, readings, "", "", payment, "", "", ""])
    extracted = pipeline.extract_document(text_pdf([[""], [""]]), "application/pdf", engine)
    draft = parse_bill_text(extracted.text)
    assert draft.period_start.value == "2026-02-03"
    assert draft.reading_previous.value == "8200.00"
    assert draft.amount_dop.value == "777.31"
    assert draft.due_date.value == "2026-03-18"
    assert engine.calls == 8
    assert extracted.pages_read == 2


def test_zero_score_variants_still_contribute_conflict_evidence():
    coherent = "03/02/2026 - 05/03/2026 = 30 días\n"
    contradictory = "03/02/2026 - 06/03/2026 = 30 días\n"
    draft, _ = read([coherent, contradictory, "", ""])
    assert draft.period_end.value == "2026-03-05"
    assert draft.period_end.confidence == "inferred"
    assert any("variantes" in warning for warning in draft.warnings)


def test_reading_row_does_not_borrow_numbers_from_the_next_line():
    draft = parse_bill_text("Activa B.T. 88776655 42\n45 días\n")
    assert draft.reading_previous.value is None
    assert draft.reading_current.value is None
    assert draft.kwh.value is None


def test_pdf_retains_selected_pages_without_pairing_unrelated_variant_indexes():
    from app.services.ocr.parser import OcrText
    from tests.test_ocr_prod import text_pdf
    period = "03/02/2026 - 05/03/2026 = 30 días\n"
    correct = "TOTAL A PAGAR RD$ 666.31\n"
    conflicting = "TOTAL A PAGAR RD$ 777.31\n"
    pages = iter((OcrText(period, (conflicting, period)),
                  OcrText(correct, (correct, conflicting)),
                  OcrText("FECHA LIMITE PAGO 18/03/2026\n", ("ruido\n", "FECHA LIMITE PAGO 18/03/2026\n"))))

    class PageEngine:
        name = "synthetic-page-replay"

        def read_image(self, image):
            return next(pages)

    extracted = pipeline.extract_document(text_pdf([[""], [""], [""]]), "application/pdf", PageEngine())
    assert isinstance(extracted.text, OcrText)
    selected = str(extracted.text)
    assert selected in extracted.text.alternatives
    selected_parts = selected.split("\n\n")
    for candidate in extracted.text.alternatives:
        assert sum(original != variant for original, variant in zip(selected_parts, candidate.split("\n\n"))) <= 1
    draft = parse_bill_text(extracted.text)
    assert draft.amount_dop.value is None  # no synthetic document-level majority
    assert draft.warnings


def test_monthly_billed_amount_keeps_priority_over_a_confident_balance_total():
    from app.services.ocr.parser import OcrText
    monthly = "03/02/2026 - 05/03/2026 = 30 días\nFACTURADO DE JUN RD$ 666.31\n"
    balance = "TOTAL A PAGAR RD$ 999.31\n"
    draft = parse_bill_text(OcrText(monthly, (monthly, balance)))
    assert draft.amount_dop.value == "666.31"
    assert draft.amount_dop.confidence == "inferred"
    assert any("facturado" in warning and "compárelo" in warning for warning in draft.warnings)


def test_cross_variant_readings_keep_the_validated_table_multiplier():
    from app.services.ocr.parser import OcrText
    primary = "03/02/2026 - 05/03/2026 = 30 días\nCONSUMO 120 kWh\n"
    table = "LECTURA ANTERIOR LECTURA ACTUAL MULTIPLO CONSUMO\n8200 8260 2 120\n"
    draft = parse_bill_text(OcrText(primary, (primary, table)))
    assert draft.kwh.value == "120.00"
    assert draft.kwh.confidence == "high"
    assert draft.reading_previous.confidence == "high"
    assert draft.reading_current.confidence == "high"
    assert not any("lecturas" in warning and "no coinciden" in warning for warning in draft.warnings)


def test_selected_text_is_evidence_even_if_not_listed_in_alternatives():
    from app.services.ocr.parser import OcrText
    selected = "TOTAL A PAGAR RD$ 666.31\n"
    alternative = "TOTAL A PAGAR RD$ 777.31\n"
    draft = parse_bill_text(OcrText(selected, (alternative,)))
    assert draft.amount_dop.value is None
    assert draft.amount_dop.confidence == "none"
    assert any("variantes" in warning and "amount_dop" in warning for warning in draft.warnings)


def test_later_pdf_page_amount_conflict_is_not_hidden_by_an_earlier_match():
    from app.services.ocr.parser import OcrText
    from tests.test_ocr_prod import text_pdf
    repeated = "TOTAL A PAGAR RD$ 666.31\n"
    conflicting = "TOTAL A PAGAR RD$ 777.31\n"
    pages = iter((repeated, OcrText(repeated, (repeated, conflicting))))

    class PageEngine:
        name = "synthetic-page-replay"

        def read_image(self, image):
            return next(pages)

    extracted = pipeline.extract_document(text_pdf([[""], [""]]), "application/pdf", PageEngine())
    draft = parse_bill_text(extracted.text)
    assert draft.amount_dop.value is None
    assert draft.amount_dop.confidence == "none"
    assert any("variantes" in warning and "amount_dop" in warning for warning in draft.warnings)


def test_pdf_text_layers_also_expose_conflicting_amounts_on_later_pages():
    from tests.test_ocr_prod import text_pdf
    common = ["FACTURA SINTETICA PARA REGRESION DE TEXTO MULTIPAGINA",
              "03/02/2026 - 05/03/2026 = 30 dias", "FECHA LIMITE PAGO 18/03/2026"]
    engine = ReplayEngine([])
    extracted = pipeline.extract_document(text_pdf([
        common + ["TOTAL A PAGAR RD$ 666.31"],
        common + ["TOTAL A PAGAR RD$ 777.31"],
    ]), "application/pdf", engine)
    assert extracted.method == "text_layer"
    assert engine.calls == 0
    draft = parse_bill_text(extracted.text)
    assert draft.amount_dop.value is None
    assert draft.amount_dop.confidence == "none"
    assert any("variantes" in warning and "amount_dop" in warning for warning in draft.warnings)
