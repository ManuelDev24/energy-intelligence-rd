"""ERD-OCR-REAL-QA (sin facturas reales): etiquetas alternativas del total y de la fecha límite.

Las etiquetas alternativas NO están verificadas con facturas reales: por eso el total sale `inferred` con aviso y la persona
lo confirma. «TOTAL A PAGAR» sigue siendo la etiqueta principal (confianza alta)."""
import pytest

from app.services.ocr.parser import parse_bill_text

BASE = "PERIODO DE FACTURACION\n01/09/2026 - 30/09/2026 = 30 días\nCONSUMO 320 kWh\n"


def parse(extra: str):
    return parse_bill_text(BASE + extra)


def test_primary_label_is_high_confidence_and_wins_over_alternatives():
    draft = parse("TOTAL FACTURA RD$ 1,111.00\nTOTAL A PAGAR RD$ 4,500.00\n")
    assert (draft.amount_dop.value, draft.amount_dop.confidence) == ("4500.00", "high")
    assert not any("etiqueta distinta" in w for w in draft.warnings)


@pytest.mark.parametrize("label", ["MONTO A PAGAR", "VALOR A PAGAR", "IMPORTE A PAGAR", "TOTAL FACTURA", "TOTAL DE LA FACTURA",
                                   "TOTAL FACTURADO", "TOTAL GENERAL", "IMPORTE TOTAL", "MONTO TOTAL", "TOTAL A COBRAR"])
def test_alternative_labels_are_read_but_flagged(label):
    draft = parse(f"{label}: RD$ 4,520.75\n")
    assert (draft.amount_dop.value, draft.amount_dop.confidence) == ("4520.75", "inferred")
    assert any("etiqueta distinta" in w for w in draft.warnings)


@pytest.mark.parametrize("line", ["SUBTOTAL RD$ 3,900.00", "Total energía RD$ 3,000.00", "TOTAL IMPUESTOS RD$ 600.00", "Total cargos RD$ 10.00"])
def test_subtotals_and_partial_totals_are_never_taken_as_the_amount(line):
    draft = parse(line + "\n")
    assert draft.amount_dop.value is None and draft.amount_dop.confidence == "none"
    assert any("No se encontró el monto total" in w for w in draft.warnings)


@pytest.mark.parametrize("line", ["FECHA LIMITE DE PAGO: 15/10/2026", "FECHA LÍMITE DE PAGO : 15 /10 /2026", "Fecha de vencimiento 15/10/2026",
                                  "VENCIMIENTO: 15-10-2026", "Pague antes del 15/10/2026"])
def test_due_date_label_variants(line):
    draft = parse(line + "\nTOTAL A PAGAR RD$ 100.00\n")
    assert draft.due_date.value == "2026-10-15", line


def test_due_date_far_from_the_period_is_dropped_with_a_warning():
    draft = parse("FECHA LIMITE DE PAGO: 15/10/2027\nTOTAL A PAGAR RD$ 100.00\n")
    assert draft.due_date.value is None and any("fecha límite" in w for w in draft.warnings)


def test_emission_date_is_not_mistaken_for_the_due_date():
    draft = parse("FECHA DE EMISION: 05/10/2026\nTOTAL A PAGAR RD$ 100.00\n")
    assert draft.due_date.value is None
