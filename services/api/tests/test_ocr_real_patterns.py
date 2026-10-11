"""ERD-OCR-REAL-QA: patrones de ruido observados en facturas REALES de EDESUR, EDENORTE y EDEESTE (2019–2024).

Los textos son sintéticos (cifras y nombres inventados); solo reproducen cómo Tesseract deforma lo que SÍ está impreso en las
tres distribuidoras. Las facturas reales no están en el repositorio."""
from app.services.ocr.parser import parse_bill_text

HEADER = "DATOS DEL CONTRATO\nTARIFA VOLTAJE PERIODO DE FACTURACIÓN\n"


def parse(body: str):
    return parse_bill_text(HEADER + body)


def test_period_line_with_a_dot_instead_of_a_slash():
    d = parse("BTS1 Baja 120/240 Doble Monofásica 12/08/2019 - 07.09/2019 = 26 dias\n")
    assert (d.period_start.value, d.period_end.value, d.days.value, d.period_start.confidence) == ("2019-08-12", "2019-09-07", "26", "high")


def test_a_misread_year_is_repaired_only_when_exactly_one_fix_fits_the_printed_days():
    d = parse("BTS1 1.313kW 19/06/2004 - 20/07/2024 = 31 días\n")
    assert (d.period_start.value, d.period_end.value) == ("2024-06-19", "2024-07-20")
    assert d.period_start.confidence == "inferred" and any("corrigió el año" in w for w in d.warnings)


def test_an_ambiguous_year_error_uses_the_emission_date_and_otherwise_is_not_guessed():
    # 2024→2026 en el fin: cuadran dos arreglos; la fecha de emisión (julio de 2024) decide.
    with_anchor = parse("FECHA DE EMISIÓN: 20/07/2024\nBTS1 19/06/2024 - 20/07/2026 = 31 días\n")
    assert (with_anchor.period_start.value, with_anchor.period_end.value) == ("2024-06-19", "2024-07-20")
    without = parse("BTS1 19/06/2024 - 20/07/2026 = 31 días\n")
    assert without.period_end.value == "2026-07-20" and without.period_end.confidence == "inferred"
    assert any("no coinciden" in w for w in without.warnings)


def test_energy_tier_with_letters_instead_of_digits():
    d = parse("Energia\n1OBKWhXRD$ 4.44 RDS 479.52\n")
    assert (d.kwh.value, d.kwh.confidence) == ("108.00", "inferred")


def test_reading_row_with_dotted_thousands_and_a_garbled_consumption():
    d = parse("Activa BT. 10203040 6.480 6,712 1.00 23ZkWh\n")
    assert (d.reading_previous.value, d.reading_current.value) == ("6480.00", "6712.00")
    assert (d.kwh.value, d.kwh.confidence) == ("232.00", "inferred")
    assert any("multiplicador supuesto 1" in w for w in d.warnings)


def test_reading_row_with_a_lowercase_missing_letter_and_garbled_multiplier():
    d = parse("AcivaBT. 30405060 1,512 1,519 Lecco 7AWRh\n")
    assert (d.reading_previous.value, d.reading_current.value, d.kwh.value) == ("1512.00", "1519.00", "7.00")


def test_a_reading_row_that_goes_backwards_or_jumps_absurdly_is_ignored():
    for row in ("Activa B.T. 10203040 6,712 6,480 1.00", "Activa B.T. 10203040 100 900,000 1.00"):
        d = parse(row + "\n")
        assert d.reading_previous.value is None and d.kwh.value is None, row


def test_importe_without_separators_is_read_as_cents_and_flagged():
    d = parse("IMPORTEENRDS 126223\n")
    assert (d.amount_dop.value, d.amount_dop.confidence) == ("1262.23", "inferred")
    assert any("dos decimales" in w for w in d.warnings)


def test_importe_total_and_the_payment_slip_agreeing_is_high_confidence():
    d = parse("IMPORTE TOTAL EN $RD 1,262.23\nFECHA LIMITE PAGO 07/10/2019\nIMPORTE EN RD$ 1,262.23\n")
    assert (d.amount_dop.value, d.amount_dop.confidence) == ("1262.23", "high")


def test_importe_read_only_once_is_inferred_and_two_different_reads_do_not_agree():
    once = parse("IMPORTE EN RDS 66.02\n")
    assert (once.amount_dop.value, once.amount_dop.confidence) == ("66.02", "inferred")
    split = parse("IMPORTE TOTAL RD$ 66.02\nIMPORTE EN RD$ 99.02\n")
    assert split.amount_dop.confidence == "inferred"


def test_edenorte_uses_the_month_billed_and_warns_when_total_to_pay_includes_other_balances():
    d = parse("FACTURADO DE MAY RD$512.30\nPAGUE ANTES DE 16/06/2020\nVALOR TOTAL A PAGAR: RD $1,190.00\n")
    assert (d.amount_dop.value, d.amount_dop.confidence) == ("512.30", "high")
    assert any("difiere de lo facturado" in w for w in d.warnings)


def test_total_a_pagar_alone_stays_high_confidence():
    d = parse("TOTAL A PAGAR RD$ 512.30\n")
    assert (d.amount_dop.value, d.amount_dop.confidence) == ("512.30", "high")


def test_the_ncf_validity_date_is_never_the_payment_due_date():
    base = "01/07/2024 - 31/07/2024 = 31 días\n"
    d = parse(base + "FECHA VENCIMIENTO NCF: 31/12/2024\nFECHA LÍMITE DE PAGO 19/08/2024\n")
    assert d.due_date.value == "2024-08-19"
    only_ncf = parse(base + "FECHA VENCIMIENTO NCF: 31/12/2024\nVálida Hasta: 31/12/2999\n")
    assert only_ncf.due_date.value is None
