"""ERD-REL-VERIFY: el parser OCR reconoce el formato real de las facturas de EDESUR, EDENORTE y EDEESTE.

Los textos son SINTÉTICOS: reproducen solo las etiquetas y formatos documentados en
docs/qa/OCR_FORMATOS_FACTURAS_RD.md (sin nombres, direcciones, NIC ni contratos reales).
"""
from decimal import Decimal

from app.services.ocr.parser import parse_bill_text

# EDESUR: período en la fila de DATOS DEL CONTRATO, "dd/mm/aaaa - dd/mm/aaaa = N días";
# lecturas en tabla (encabezado y valores en la línea siguiente).
EDESUR_LAYOUT = """
EDESUR DOMINICANA
FECHA DE EMISION: 16 /05 /2023        FECHA LIMITE DE PAGO : 15/06/2023
DATOS DEL CONTRATO
VOLTAJE:   POTENCIA CONTRATADA   PERIODO DE FACTURACION
TARIFA: BTS1   Baja 120 Monofásica   .599 kW   17/04/2023 - 16/05/2023 = 29 días
LECTURA ANTERIOR  LECTURA ACTUAL  MULTIPLO  CONSUMO
12,450            12,760          1         310
TOTAL A PAGAR RD$ 3,215.40
"""

# EDEESTE: mismo patrón de período con "Días"; consumo por escalones "N kWh X RD$ tarifa".
EDEESTE_LAYOUT = """
EDEESTE
DATOS DEL CONTRATO
VOLTAJE: POTENCIA CONTRATADA PERIODO DE FACTURACIÓN
TARIFA: BTS1
Baja 120 Monofásica .599 kW 14/12/2025 - 14/01/2026 = 30 Días
CALCULO DE LA FACTURA
Cargo Fijo 30 dias, RD$ 137.25        RD$ 137.25
200 kWh X RD$ 4.44                    RD$ 888.00
61 kWh X RD$ 6.97                     RD$ 425.17
TOTAL A PAGAR RD$ 1,450.42
"""

# EDENORTE: tabla de lecturas con TIPO DE LECTURA y NO DE CONTADOR; energía en una línea.
EDENORTE_LAYOUT = """
EDENORTE DOMINICANA
TARIFA..............: BTS1
PERIODO DE FACTURACION 05/09/2026 - 04/10/2026 = 29 dias
TIPO DE LECTURA  NO DE CONTADOR  LECTURA ANTERIOR  LECTURA ACTUAL  MULTIPLO  CONSUMO
REAL             0000000         8,100             8,420           1         320
DETALLE IMPORTES FACTURADOS
Energía 320 kWh X RD$ 10.86   3,475.20
TOTAL A PAGAR RD$ 3,612.45
"""


def test_edesur_period_with_spaced_dates_and_explicit_days():
    d = parse_bill_text(EDESUR_LAYOUT)
    assert (d.period_start.value, d.period_end.value) == ("2023-04-17", "2023-05-16")
    assert d.period_start.confidence == "high"
    assert (d.days.value, d.days.confidence) == ("29", "high")


def test_edesur_reading_table_gives_readings_and_kwh():
    d = parse_bill_text(EDESUR_LAYOUT)
    assert Decimal(d.reading_previous.value) == Decimal("12450")
    assert Decimal(d.reading_current.value) == Decimal("12760")
    assert Decimal(d.kwh.value) == Decimal("310")
    assert Decimal(d.amount_dop.value) == Decimal("3215.40")
    assert d.warnings == []


def test_edeeste_period_label_and_dates_on_different_lines():
    d = parse_bill_text(EDEESTE_LAYOUT)
    assert (d.period_start.value, d.period_end.value) == ("2025-12-14", "2026-01-14")
    assert (d.days.value, d.days.confidence) == ("30", "high")


def test_edeeste_tiered_kwh_lines_are_summed_as_inferred():
    d = parse_bill_text(EDEESTE_LAYOUT)
    assert Decimal(d.kwh.value) == Decimal("261")
    assert d.kwh.confidence == "inferred"
    assert Decimal(d.amount_dop.value) == Decimal("1450.42")


def test_edeeste_fixed_charge_days_are_not_taken_as_the_amount():
    d = parse_bill_text(EDEESTE_LAYOUT)
    assert Decimal(d.amount_dop.value) != Decimal("137.25")


def test_edenorte_table_with_extra_columns_and_energy_line():
    d = parse_bill_text(EDENORTE_LAYOUT)
    assert (d.period_start.value, d.period_end.value) == ("2026-09-05", "2026-10-04")
    assert d.days.value == "29"
    assert Decimal(d.reading_previous.value) == Decimal("8100")
    assert Decimal(d.reading_current.value) == Decimal("8420")
    assert Decimal(d.kwh.value) == Decimal("320")
    assert Decimal(d.amount_dop.value) == Decimal("3612.45")


def test_period_label_with_de_facturacion_and_al():
    """El caso que falló en la sonda Docker: 'Periodo de facturacion: dd/mm/aaaa al dd/mm/aaaa'."""
    d = parse_bill_text("Periodo de facturacion: 01/09/2026 al 30/09/2026\nConsumo: 320 kWh\nTotal a pagar: RD$ 4,500.00")
    assert (d.period_start.value, d.period_end.value) == ("2026-09-01", "2026-09-30")


def test_emission_and_due_dates_are_never_taken_as_the_period():
    text = "FECHA DE EMISION: 16/05/2023   FECHA LIMITE DE PAGO : 15/06/2023\nTotal a pagar RD$ 10.00"
    d = parse_bill_text(text)
    assert d.period_start.value is None and d.period_end.value is None


def test_inconsistent_reading_table_is_not_trusted():
    """Si (actual - anterior) x múltiplo no da el consumo impreso, no se adivina: se avisa."""
    text = ("PERIODO DE FACTURACION 01/01/2026 - 31/01/2026 = 30 días\n"
            "LECTURA ANTERIOR LECTURA ACTUAL MULTIPLO CONSUMO\n1000 1300 1 999\nTOTAL A PAGAR RD$ 100.00")
    d = parse_bill_text(text)
    assert d.kwh.value is None or d.kwh.confidence != "high"
    assert any("lectura" in w.lower() or "consumo" in w.lower() for w in d.warnings)


# Salidas REALES de Tesseract 5 (spa+eng) sobre fotos simuladas de los layouts de arriba: "RD$" leído
# como "RDS", "=" como ">", ":" pegado a las fechas, "TOTAL/A PAGAR", guion leído como "=".
TESSERACT_EDESUR_PHOTO = """
«FECHA DE EMISION: 16/05/2023 200%, FECHA LIMITE DE "PAGO: 15/06/2023
"VOLTAJE: |. POTENCIA CONTRATADA ' PERIODO: DE FACTURACIÓN
TARIFA: BTSI", Baja 120: Monofásica -: 599. kW. 17/04/2023: - 16/05/2023 > 29 días
TOTAL A PAGAR'RD$- 3,215.40 :
"""
TESSERACT_EDEESTE_CLEAN = """
Baja 120 Monofásica .599 kW 14/12/2025 - 14/01/2026 = 30 Días
Cargo Fijo 30 dias, RD$ 137.25 RD$ 137.25
200 kWh X RDS 4.44 RD$ 888.00
61 kWh X RDS 6.97 RD$ 425.17
TOTAL A PAGAR RD$ 1,450.42
"""
TESSERACT_EDEESTE_PHOTO = """
Baja 120 Ménofasica +599. kW 18/12/2025 = 14/01/2026 = 30 Dias
'TOTAL/A PAGAR RD$ 1,450.42 :
"""


def test_tesseract_noise_colon_and_gt_around_the_period():
    d = parse_bill_text(TESSERACT_EDESUR_PHOTO)
    assert (d.period_start.value, d.period_end.value, d.days.value) == ("2023-04-17", "2023-05-16", "29")
    assert Decimal(d.amount_dop.value) == Decimal("3215.40")


def test_tesseract_reads_rd_dollar_as_rds_in_tier_lines():
    d = parse_bill_text(TESSERACT_EDEESTE_CLEAN)
    assert Decimal(d.kwh.value) == Decimal("261")
    assert d.kwh.confidence == "inferred"


def test_tesseract_equals_instead_of_dash_and_slash_in_total_label():
    d = parse_bill_text(TESSERACT_EDEESTE_PHOTO)
    # La fecha mal leída (18 por 14) no se corrige: la persona confirma contra la foto.
    assert (d.period_start.value, d.period_end.value, d.days.value) == ("2025-12-18", "2026-01-14", "30")
    assert Decimal(d.amount_dop.value) == Decimal("1450.42")


def test_tesseract_gt_between_dates_and_dot_after_days():
    d = parse_bill_text("PERIODO DE. FACTURACION. 05/09/2026: > 04/10/2026 29. dias:")
    assert (d.period_start.value, d.period_end.value, d.days.value) == ("2026-09-05", "2026-10-04", "29")


def test_printed_days_that_do_not_match_the_dates_lower_confidence_and_warn():
    """Tesseract leyó 18/12 por 14/12: los 30 días impresos no cuadran con 27 transcurridos."""
    d = parse_bill_text(TESSERACT_EDEESTE_PHOTO)
    assert d.period_start.confidence == "inferred" and d.period_end.confidence == "inferred"
    assert any("días" in w for w in d.warnings)


def test_printed_days_accept_both_conventions():
    for line in ("17/04/2023 - 16/05/2023 = 29 días", "01/09/2026 - 30/09/2026 = 30 días"):
        d = parse_bill_text(line)
        assert d.period_start.confidence == "high" and d.warnings[:1] != ["días"]
        assert not any("no coinciden con las fechas" in w for w in d.warnings)
