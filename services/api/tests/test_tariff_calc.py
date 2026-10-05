"""Motor de tarifas puro.

Dos tipos de datos de prueba, claramente separados:
- SYNTHETIC_*: FIXTURES SINTÉTICAS (no oficiales) solo para la aritmética del motor.
- EDESUR_BTS1_2026Q4: valores oficiales de la Resolución SIE-121-2026-TF, columna
  "Tarifas de Transición" (ver docs/architecture/TARIFF_BTS1_2026Q4.md); ejemplos de control del documento.
"""
from decimal import Decimal as D
from types import SimpleNamespace as NS

import pytest

from app.services import tariff_calc as tc


def rng(frm, to, **kw):
    return NS(from_kwh=D(str(frm)), to_kwh=None if to is None else D(str(to)),
              **{k: D(str(v)) for k, v in kw.items()})


def block(frm, to, price):
    return rng(frm, to, price_rd_per_kwh=price)


def fixed(frm, to, amount):
    return rng(frm, to, amount_rd=amount)


# FIXTURE SINTÉTICA (no oficial): cargo fijo único, 3 bloques progresivos, sin regla plana.
SYNTHETIC_TARIFF = NS(fixed_charges=[fixed(0, None, "100.00")], flat_all_units_from_kwh=None, blocks=[
    block(0, 200, "5.00"), block(200, 300, "7.50"), block(300, None, "10.00"),
])

# OFICIAL: EDESUR BTS-1, SIE-121-2026-TF, Tarifas de Transición (SENI), oct–dic 2026.
EDESUR_BTS1_2026Q4 = NS(
    fixed_charges=[fixed(0, 100, "42.10"), fixed(100, None, "128.59")],
    flat_all_units_from_kwh=D("701"),
    blocks=[block(0, 200, "6.05"), block(200, 300, "8.59"), block(300, 700, "12.89"), block(700, None, "13.09")],
)


# ---------- aritmética (fixture sintética) ----------
def test_cost_inside_first_block():
    r = tc.cost(D("150"), SYNTHETIC_TARIFF)
    assert r.fixed_charge_rd == D("100.00") and r.mode == "tiered"
    assert [(b.kwh, b.amount_rd) for b in r.blocks] == [(D("150.00"), D("750.00"))]
    assert r.energy_rd == D("750.00") and r.total_rd == D("850.00")


def test_cost_spans_all_blocks_progressively():
    r = tc.cost(D("350"), SYNTHETIC_TARIFF)
    # 200×5 + 100×7.5 + 50×10 = 1000 + 750 + 500
    assert [(b.from_kwh, b.to_kwh, b.kwh, b.amount_rd) for b in r.blocks] == [
        (D("0"), D("200"), D("200.00"), D("1000.00")),
        (D("200"), D("300"), D("100.00"), D("750.00")),
        (D("300"), None, D("50.00"), D("500.00")),
    ]
    assert r.energy_rd == D("2250.00") and r.total_rd == D("2350.00") and r.kwh == D("350")


def test_cost_exact_block_boundary_does_not_touch_next_block():
    r = tc.cost(D("200"), SYNTHETIC_TARIFF)
    assert len(r.blocks) == 1 and r.energy_rd == D("1000.00")


def test_cost_zero_kwh_is_first_fixed_charge_only():
    r = tc.cost(D("0"), SYNTHETIC_TARIFF)
    assert r.blocks == [] and r.energy_rd == D("0.00") and r.total_rd == D("100.00")


def test_cost_uses_decimal_rounding_half_up_per_block():
    t = NS(fixed_charges=[fixed(0, None, 0)], flat_all_units_from_kwh=None, blocks=[block(0, None, "3.3333")])
    r = tc.cost(D("10.005"), t)
    assert r.blocks[0].amount_rd == D("33.35")  # 33.3496665 -> 33.35 (redondeo al final, no por factor)
    assert r.blocks[0].kwh == D("10.01")        # 10.005 -> 10.01 (HALF_UP)
    assert isinstance(r.total_rd, D)


def test_blocks_and_fixed_ranges_are_sorted_before_charging():
    t = NS(fixed_charges=list(reversed(EDESUR_BTS1_2026Q4.fixed_charges)), flat_all_units_from_kwh=D("701"),
           blocks=list(reversed(EDESUR_BTS1_2026Q4.blocks)))
    assert tc.cost(D("500"), t).total_rd == D("4775.59")


def test_negative_kwh_rejected():
    with pytest.raises(ValueError):
        tc.cost(D("-1"), SYNTHETIC_TARIFF)


@pytest.mark.parametrize("blocks", [
    [],                                                   # sin bloques
    [block(10, None, 1)],                                 # no empieza en 0
    [block(0, 100, 1), block(150, None, 2)],              # hueco
    [block(0, 100, 1), block(50, None, 2)],               # solape
    [block(0, 100, 1), block(100, 200, 2)],               # último bloque cerrado
    [block(0, None, 1), block(100, None, 2)],             # bloque abierto no final
    [block(0, 0, 1), block(0, None, 2)],                  # bloque vacío
    [block(0, None, -1)],                                 # precio negativo
])
def test_invalid_block_structures_are_rejected(blocks):
    with pytest.raises(ValueError):
        tc.cost(D("10"), NS(fixed_charges=[fixed(0, None, 0)], flat_all_units_from_kwh=None, blocks=blocks))


@pytest.mark.parametrize("charges", [
    [], [fixed(0, None, -1)], [fixed(0, 100, 1)], [fixed(0, 100, 1), fixed(150, None, 2)], [fixed(5, None, 1)],
])
def test_invalid_fixed_charge_ranges_are_rejected(charges):
    with pytest.raises(ValueError):
        tc.cost(D("10"), NS(fixed_charges=charges, flat_all_units_from_kwh=None, blocks=[block(0, None, 1)]))


def test_flat_threshold_must_be_positive():
    t = NS(fixed_charges=[fixed(0, None, 0)], flat_all_units_from_kwh=D("0"), blocks=[block(0, None, 1)])
    with pytest.raises(ValueError):
        tc.cost(D("10"), t)


# ---------- ejemplos de control oficiales (EDESUR BTS-1, SIE-121-2026-TF) ----------
@pytest.mark.parametrize("kwh,total", [
    ("80", "526.10"), ("250", "1768.09"), ("500", "4775.59"), ("750", "9946.09"),
])
def test_edesur_bts1_golden_examples_from_resolution(kwh, total):
    assert tc.cost(D(kwh), EDESUR_BTS1_2026Q4).total_rd == D(total)


@pytest.mark.parametrize("kwh,fixed_rd,total,mode", [
    ("100", "42.10", "647.10", "tiered"),    # 42.10 + 100×6.05
    ("101", "128.59", "739.64", "tiered"),   # cambia el cargo fijo desde 101 kWh
    ("200", "128.59", "1338.59", "tiered"),  # todo en rango 1
    ("201", "128.59", "1347.18", "tiered"),  # 1 kWh en rango 2
    ("300", "128.59", "2197.59", "tiered"),
    ("301", "128.59", "2210.48", "tiered"),  # 1 kWh en rango 3
    ("700", "128.59", "7353.59", "tiered"),  # 200×6.05 + 100×8.59 + 400×12.89
    ("701", "128.59", "9304.68", "flat_all_units"),  # TODOS los kWh a 13.09
])
def test_edesur_bts1_boundaries(kwh, fixed_rd, total, mode):
    r = tc.cost(D(kwh), EDESUR_BTS1_2026Q4)
    assert (r.fixed_charge_rd, r.total_rd, r.mode) == (D(fixed_rd), D(total), mode)


def test_flat_all_units_breakdown_is_single_line_at_fourth_range_price():
    r = tc.cost(D("750"), EDESUR_BTS1_2026Q4)
    assert [(b.from_kwh, b.to_kwh, b.kwh, b.price_rd_per_kwh, b.amount_rd) for b in r.blocks] == [
        (D("0"), None, D("750.00"), D("13.09"), D("9817.50"))]
