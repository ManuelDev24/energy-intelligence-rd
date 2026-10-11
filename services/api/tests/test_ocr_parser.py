"""ERD-OCR-01: parser puro de texto OCR -> borrador de factura. Nunca escribe en BD."""
from decimal import Decimal

from app.services.ocr.parser import parse_bill_text

SAMPLE_EDESUR = """
EDESUR DOMINICANA
Factura de energía eléctrica
Cliente: Alice Pérez          Cuenta: ACC-123
Período del 01/08/2026 al 31/08/2026   (31 días)
Lectura anterior: 1000 kWh
Lectura actual:   1300 kWh
Consumo del período: 300 kWh
Total a pagar: RD$ 4,520.75
"""

SAMPLE_NOISY = """
EDENORTE
perido 05/09/2026-04/10/2026
lecura previa 850
lecura actua 1 020
consurno 170 kwh
TOTAL A PAGAR  RD$2,310.00
"""


def test_parses_clean_sample_with_all_fields_and_high_confidence():
    draft = parse_bill_text(SAMPLE_EDESUR)
    assert draft.period_start.value == "2026-08-01"
    assert draft.period_end.value == "2026-08-31"
    assert draft.days.value == "31"
    assert draft.kwh.value == "300.00" or Decimal(draft.kwh.value) == Decimal("300")
    assert Decimal(draft.amount_dop.value) == Decimal("4520.75")
    assert Decimal(draft.reading_previous.value) == Decimal("1000")
    assert Decimal(draft.reading_current.value) == Decimal("1300")
    for field in (draft.period_start, draft.period_end, draft.amount_dop, draft.kwh):
        assert field.confidence == "high"
    assert draft.warnings == []


def test_computes_days_when_not_stated_explicitly():
    text = "Período del 01/01/2026 al 10/01/2026\nTotal a pagar RD$ 100.00\nConsumo 50 kWh"
    draft = parse_bill_text(text)
    assert draft.days.value == "10"
    assert draft.days.confidence == "inferred"


def test_missing_amount_is_none_with_a_warning_not_a_guess():
    text = "Período del 01/01/2026 al 10/01/2026\nConsumo 50 kWh"
    draft = parse_bill_text(text)
    assert draft.amount_dop.value is None
    assert any("monto" in w.lower() for w in draft.warnings)


def test_noisy_ocr_text_still_extracts_dates_and_amount_best_effort():
    draft = parse_bill_text(SAMPLE_NOISY)
    assert draft.period_start.value == "2026-09-05"
    assert draft.period_end.value == "2026-10-04"
    assert Decimal(draft.amount_dop.value) == Decimal("2310.00")


def test_empty_or_unreadable_text_returns_all_none_with_warnings_never_raises():
    draft = parse_bill_text("   \n\n  ")
    assert draft.period_start.value is None
    assert draft.amount_dop.value is None
    assert len(draft.warnings) > 0


def test_reading_current_lower_than_previous_is_dropped_not_trusted():
    """Un error de OCR que invierte lecturas no debe pasar como válido silenciosamente."""
    text = "Lectura anterior: 1300 kWh\nLectura actual: 1000 kWh\nTotal a pagar RD$ 1.00"
    draft = parse_bill_text(text)
    assert draft.reading_previous.value is None
    assert draft.reading_current.value is None
    assert any("lectura" in w.lower() for w in draft.warnings)


def test_never_raises_on_garbage_input():
    for garbage in ("", "asdkjaslkdj129381", "RD$RD$RD$", "/////", None):
        draft = parse_bill_text(garbage or "")
        assert draft is not None


# ---------- ERD-ALERT-02: fecha límite de pago ----------
def _with_due(line):
    return SAMPLE_EDESUR + line + "\n"


def test_due_date_is_read_from_common_labels():
    # Etiquetas observadas en facturas reales (EDESUR/EDEESTE «fecha límite de pago», EDENORTE «pague antes de»): confianza alta.
    for line in ("Fecha límite de pago: 15/09/2026", "FECHA LIMITE PAGO: 15/09/2026", "PAGUE ANTES DE 15/09/2026", "Pague antes del 15 / 09 / 2026"):
        draft = parse_bill_text(_with_due(line))
        assert draft.due_date.value == "2026-09-15" and draft.due_date.confidence == "high", line
    # Etiquetas sin verificar: se leen, pero solo como `inferred`.
    for line in ("FECHA DE VENCIMIENTO 15/09/2026", "Vence el 15/09/2026"):
        draft = parse_bill_text(_with_due(line))
        assert draft.due_date.value == "2026-09-15" and draft.due_date.confidence == "inferred", line
    assert parse_bill_text(SAMPLE_EDESUR).due_date.value is None and parse_bill_text(SAMPLE_EDESUR).due_date.confidence == "none"


def test_an_incoherent_due_date_is_dropped_with_a_warning():
    draft = parse_bill_text(_with_due("Fecha límite de pago: 15/03/2025"))        # antes del período
    assert draft.due_date.value is None and any("fecha límite" in w for w in draft.warnings)
    far = parse_bill_text(_with_due("Fecha límite de pago: 15/01/2027"))          # más de 120 días después
    assert far.due_date.value is None


def test_due_date_without_a_period_is_only_inferred_and_invalid_dates_are_ignored():
    draft = parse_bill_text("Total a pagar: RD$ 100.00\nFecha límite de pago: 15/09/2026")
    assert draft.due_date.value == "2026-09-15" and draft.due_date.confidence == "inferred"
    assert parse_bill_text(_with_due("Fecha límite de pago: 31/02/2026")).due_date.value is None


def test_old_stored_drafts_without_due_date_still_validate():
    from app.schemas.ocr import OcrDraft
    old = parse_bill_text(SAMPLE_EDESUR).model_dump()
    old.pop("due_date")
    assert OcrDraft(**old).due_date.value is None
