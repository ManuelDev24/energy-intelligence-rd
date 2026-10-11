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


CONCEPTS = "Cargo Fijo\n29 días, RD$ 137.25 RD$ 137.25\nEnergía\n85 kWh X RD$ 4.44 RD$ 377.40\n"   # 137.25 + 377.40 = 514.65


def test_edenorte_uses_the_month_billed_and_warns_when_total_to_pay_includes_other_balances():
    d = parse(CONCEPTS + "FACTURADO DE MAY RD$514.65\nPAGUE ANTES DE 16/06/2020\nVALOR TOTAL A PAGAR: RD $1,190.00\n")
    assert (d.amount_dop.value, d.amount_dop.confidence) == ("514.65", "high")      # confirmado por la suma de los conceptos
    assert any("difiere de lo facturado" in w for w in d.warnings)


def test_a_single_read_of_the_month_billed_is_only_inferred():
    d = parse("FACTURADO DE MAY RD$514.65\n")
    assert (d.amount_dop.value, d.amount_dop.confidence) == ("514.65", "inferred")


def test_an_amount_that_contradicts_the_sum_of_its_concepts_is_inferred_with_a_warning():
    d = parse(CONCEPTS + "FACTURADO DE MAY RD$614.65\n")                            # un dígito mal leído
    assert (d.amount_dop.value, d.amount_dop.confidence) == ("614.65", "inferred")
    assert any("no coincide con la suma de los conceptos (514.65)" in w for w in d.warnings)


def test_a_missing_amount_is_computed_from_the_concepts_and_flagged():
    d = parse(CONCEPTS)
    assert (d.amount_dop.value, d.amount_dop.confidence) == ("514.65", "inferred")
    assert any("se calculó sumando" in w for w in d.warnings)


def test_concepts_with_noisy_currency_symbols_still_add_up():
    d = parse("Cargo Fijo\n26 días, ROS 137.25 RDS 137.25\nEnergía\n200 kWh X ROS 4.44 RD$ 888.00\n40 kWh X R0S 6.97 RDS 278.80\nIMPORTE TOTAL RD$ 1,304.05\n")
    assert (d.amount_dop.value, d.amount_dop.confidence) == ("1304.05", "high")


def test_without_a_readable_cargo_fijo_or_tiers_the_amount_is_not_cross_checked():
    d = parse("Energía\n85 kWh X RD$ 4.44 RD$ 377.40\nTOTAL A PAGAR RD$ 999.00\n")
    assert (d.amount_dop.value, d.amount_dop.confidence) == ("999.00", "high")


def test_days_misread_as_diaz_still_parse_the_period():
    d = parse("12/08/2026 - 07/09/2026 = 26 diaz\n")
    assert (d.period_start.value, d.days.value, d.period_start.confidence) == ("2026-08-12", "26", "high")


def test_total_a_pagar_alone_stays_high_confidence():
    d = parse("TOTAL A PAGAR RD$ 512.30\n")
    assert (d.amount_dop.value, d.amount_dop.confidence) == ("512.30", "high")


def test_the_ncf_validity_date_is_never_the_payment_due_date():
    base = "01/07/2024 - 31/07/2024 = 31 días\n"
    d = parse(base + "FECHA VENCIMIENTO NCF: 31/12/2024\nFECHA LÍMITE DE PAGO 19/08/2024\n")
    assert d.due_date.value == "2024-08-19"
    only_ncf = parse(base + "FECHA VENCIMIENTO NCF: 31/12/2024\nVálida Hasta: 31/12/2999\n")
    assert only_ncf.due_date.value is None
