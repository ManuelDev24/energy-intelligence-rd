"""Data: official BTS-1 'Tarifas de Transición' Oct–Dec 2026 (SIE-121-2026-TF, SENI circuits).

Source: https://sie.gob.do/document/sie-121-2026-tf/ (Art. 2 table p. 9, block rule Art. 4 pp. 10-11),
transcribed in docs/architecture/TARIFF_BTS1_2026Q4.md. Only the billable transition column is loaded;
the reference column (not billed) and Pedernales (Art. 3) are intentionally NOT loaded.
Fixed UUIDs let downgrade delete exactly these rows and nothing else.
"""
import uuid

from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

SOURCE_RESOLUTION = "SIE-121-2026-TF"
SOURCE_URL = "https://sie.gob.do/document/sie-121-2026-tf/"
SCOPE = "Tarifas de Transición; circuitos SENI; facturas emitidas 2026-10-01..2026-12-31"
NS = uuid.UUID("6b1f3a52-5f0e-4c39-9a51-2c1d0b0e7a10")

# distributor: (fixed 0-100 kWh, fixed >=101 kWh, [range1, range2, range3, range4 RD$/kWh])
VALUES = {
    "EDESUR": ("42.10", "128.59", ["6.05", "8.59", "12.89", "13.09"]),
    "EDENORTE": ("40.33", "126.81", ["5.97", "8.51", "13.83", "14.04"]),
    "EDEESTE": ("41.34", "127.83", ["6.17", "8.71", "13.04", "13.26"]),
}
FIXED_BOUNDS = [("0", "100"), ("100", None)]
BLOCK_BOUNDS = [("0", "200"), ("200", "300"), ("300", "700"), ("700", None)]


def _id(*parts):
    return uuid.uuid5(NS, "/".join(parts))


tariffs = sa.table("tariffs", sa.column("id", sa.Uuid), sa.column("distributor", sa.String),
                   sa.column("tariff_code", sa.String), sa.column("effective_from", sa.Date),
                   sa.column("effective_to", sa.Date), sa.column("flat_all_units_from_kwh", sa.Numeric),
                   sa.column("source_resolution", sa.String), sa.column("source_url", sa.String),
                   sa.column("scope_note", sa.String))
fixed = sa.table("tariff_fixed_charges", sa.column("id", sa.Uuid), sa.column("tariff_id", sa.Uuid),
                 sa.column("from_kwh", sa.Numeric), sa.column("to_kwh", sa.Numeric), sa.column("amount_rd", sa.Numeric))
blocks = sa.table("tariff_blocks", sa.column("id", sa.Uuid), sa.column("tariff_id", sa.Uuid),
                  sa.column("from_kwh", sa.Numeric), sa.column("to_kwh", sa.Numeric),
                  sa.column("price_rd_per_kwh", sa.Numeric))


def upgrade():
    from datetime import date
    from decimal import Decimal as D
    t_rows, f_rows, b_rows = [], [], []
    for dist, (fixed_low, fixed_high, prices) in VALUES.items():
        tid = _id(SOURCE_RESOLUTION, dist)
        t_rows.append(dict(id=tid, distributor=dist, tariff_code="BTS-1", effective_from=date(2026, 10, 1),
                           effective_to=date(2026, 12, 31), flat_all_units_from_kwh=D("701"),
                           source_resolution=SOURCE_RESOLUTION, source_url=SOURCE_URL, scope_note=SCOPE))
        for (lo, hi), amount in zip(FIXED_BOUNDS, (fixed_low, fixed_high)):
            f_rows.append(dict(id=_id(SOURCE_RESOLUTION, dist, "fixed", lo), tariff_id=tid, from_kwh=D(lo),
                               to_kwh=D(hi) if hi else None, amount_rd=D(amount)))
        for (lo, hi), price in zip(BLOCK_BOUNDS, prices):
            b_rows.append(dict(id=_id(SOURCE_RESOLUTION, dist, "block", lo), tariff_id=tid, from_kwh=D(lo),
                               to_kwh=D(hi) if hi else None, price_rd_per_kwh=D(price)))
    op.bulk_insert(tariffs, t_rows)
    op.bulk_insert(fixed, f_rows)
    op.bulk_insert(blocks, b_rows)


def downgrade():
    ids = [_id(SOURCE_RESOLUTION, dist) for dist in VALUES]
    # Fixed charges and blocks cascade from tariffs.
    op.execute(tariffs.delete().where(tariffs.c.id.in_(ids)))
