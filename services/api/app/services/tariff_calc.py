"""Motor de tarifas puro (sin HTTP ni ORM), con Decimal.

Modelo (cubre BTS-1, Resolución SIE-121-2026-TF):
- Rangos de cargo fijo (from_kwh, to_kwh] -> amount_rd: se aplica UN cargo fijo, el del rango que
  contiene el consumo mensual (0 kWh cae en el primer rango).
- Bloques de energía (from_kwh, to_kwh] -> price_rd_per_kwh, escalonados.
- flat_all_units_from_kwh (opcional): si el consumo es >= ese umbral, TODOS los kWh se cobran al precio
  del bloque que contiene el umbral (BTS-1: >= 701 kWh -> todo al 4º rango, sin escalonado).
Rangos y bloques deben empezar en 0, ser contiguos y terminar abiertos (to_kwh=None).
No incluye impuestos, alumbrado ni otros cargos de la factura: el resultado es una ESTIMACIÓN.
"""
from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Iterable, Literal, Protocol, Sequence


class RangeLike(Protocol):
    from_kwh: Decimal
    to_kwh: Decimal | None


class TariffLike(Protocol):
    fixed_charges: Iterable[Any]          # RangeLike + amount_rd
    blocks: Iterable[Any]                 # RangeLike + price_rd_per_kwh
    flat_all_units_from_kwh: Decimal | None


def q2(x: Decimal) -> Decimal:
    return x.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class BlockCharge:
    from_kwh: Decimal
    to_kwh: Decimal | None
    kwh: Decimal
    price_rd_per_kwh: Decimal
    amount_rd: Decimal


@dataclass(frozen=True)
class CostBreakdown:
    kwh: Decimal
    mode: Literal["tiered", "flat_all_units"]
    fixed_charge_rd: Decimal
    blocks: list[BlockCharge]
    energy_rd: Decimal
    total_rd: Decimal


def validate_ranges(ranges: Iterable[Any], value_attr: str, label: str) -> list[Any]:
    ordered = sorted(ranges, key=lambda r: Decimal(r.from_kwh))
    if not ordered:
        raise ValueError(f"La tarifa no tiene {label}")
    if Decimal(ordered[0].from_kwh) != 0:
        raise ValueError(f"El primer {label} debe empezar en 0 kWh")
    for i, r in enumerate(ordered):
        if Decimal(getattr(r, value_attr)) < 0:
            raise ValueError(f"Valor negativo en {label}")
        last = i == len(ordered) - 1
        if r.to_kwh is None:
            if not last:
                raise ValueError(f"Solo el último {label} puede ser abierto")
            continue
        if last:
            raise ValueError(f"El último {label} debe ser abierto (to_kwh=None)")
        if Decimal(r.to_kwh) <= Decimal(r.from_kwh):
            raise ValueError("to_kwh debe ser mayor que from_kwh")
        if Decimal(ordered[i + 1].from_kwh) != Decimal(r.to_kwh):
            raise ValueError(f"Los {label} deben ser contiguos, sin huecos ni solapes")
    return ordered


def _containing(ordered: Sequence[Any], kwh: Decimal) -> Any:
    """Rango (from, to] que contiene kwh; 0 kWh pertenece al primero."""
    for r in ordered:
        if r.to_kwh is None or kwh <= Decimal(r.to_kwh):
            return r
    raise ValueError("Consumo fuera de los rangos")  # pragma: no cover - el último rango es abierto


def cost(kwh: Decimal, tariff: TariffLike) -> CostBreakdown:
    kwh = Decimal(kwh)
    if kwh < 0:
        raise ValueError("kWh negativo")
    fixed_ranges = validate_ranges(tariff.fixed_charges, "amount_rd", "rango de cargo fijo")
    blocks = validate_ranges(tariff.blocks, "price_rd_per_kwh", "bloque de energía")
    flat_from = tariff.flat_all_units_from_kwh
    if flat_from is not None and Decimal(flat_from) <= 0:
        raise ValueError("El umbral de cobro plano debe ser positivo")
    fixed = Decimal(_containing(fixed_ranges, kwh).amount_rd)

    charges: list[BlockCharge] = []
    if flat_from is not None and kwh >= Decimal(flat_from):
        mode: Literal["tiered", "flat_all_units"] = "flat_all_units"
        price = Decimal(_containing(blocks, Decimal(flat_from)).price_rd_per_kwh)
        charges.append(BlockCharge(Decimal(0), None, q2(kwh), price, q2(kwh * price)))
    else:
        mode = "tiered"
        for b in blocks:
            lower = Decimal(b.from_kwh)
            upper = kwh if b.to_kwh is None else min(kwh, Decimal(b.to_kwh))
            in_block = upper - lower
            if in_block <= 0:
                break
            price = Decimal(b.price_rd_per_kwh)
            charges.append(BlockCharge(lower, b.to_kwh, q2(in_block), price, q2(in_block * price)))
    energy = q2(sum((c.amount_rd for c in charges), Decimal(0)))
    return CostBreakdown(kwh=kwh, mode=mode, fixed_charge_rd=q2(fixed), blocks=charges, energy_rd=energy,
                         total_rd=q2(fixed + energy))
