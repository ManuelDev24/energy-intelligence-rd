import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict

TariffDistributor = Literal["EDESUR", "EDENORTE", "EDEESTE"]


class TariffFixedChargeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    from_kwh: Decimal           # rango (from_kwh, to_kwh] de consumo mensual
    to_kwh: Decimal | None
    amount_rd: Decimal


class TariffBlockOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    from_kwh: Decimal           # bloque (from_kwh, to_kwh]
    to_kwh: Decimal | None
    price_rd_per_kwh: Decimal


class TariffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    distributor: TariffDistributor
    tariff_code: str
    effective_from: date
    effective_to: date | None
    flat_all_units_from_kwh: Decimal | None   # >= umbral: todos los kWh al precio del bloque que lo contiene
    fixed_charges: list[TariffFixedChargeOut]
    blocks: list[TariffBlockOut]
    source_resolution: str
    source_url: str | None
    scope_note: str | None


class TariffRef(BaseModel):
    """Tarifa usada en una estimación de RD$ (siempre ESTIMATED: el pliego no incluye impuestos ni otros cargos)."""
    tariff_id: uuid.UUID
    distributor: TariffDistributor
    tariff_code: str
    effective_from: date
    effective_to: date | None
    source_resolution: str
    source_url: str | None
