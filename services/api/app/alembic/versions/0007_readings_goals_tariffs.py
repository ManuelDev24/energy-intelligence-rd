"""Phase 2 schema: meter readings, monthly goals and versioned tariffs. Tariff data lives in 0008."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("meter_readings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("home_id", UUID(as_uuid=True), sa.ForeignKey("homes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reading_kwh", sa.Numeric(12, 2), nullable=False),
        sa.Column("source", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("note", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("reading_kwh >= 0", name="ck_meter_readings_kwh_nonneg"),
        sa.CheckConstraint("source IN ('manual')", name="ck_meter_readings_source"),
        sa.UniqueConstraint("home_id", "read_at", name="uq_meter_readings_home_read_at"))
    op.create_table("home_goals",
        sa.Column("home_id", UUID(as_uuid=True), sa.ForeignKey("homes.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("monthly_amount_rd", sa.Numeric(12, 2)),
        sa.Column("monthly_kwh", sa.Numeric(12, 2)),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("monthly_amount_rd IS NOT NULL OR monthly_kwh IS NOT NULL", name="ck_home_goals_any"),
        sa.CheckConstraint("monthly_amount_rd IS NULL OR monthly_amount_rd > 0", name="ck_home_goals_amount_pos"),
        sa.CheckConstraint("monthly_kwh IS NULL OR monthly_kwh > 0", name="ck_home_goals_kwh_pos"))
    op.create_table("tariffs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("distributor", sa.String(20), nullable=False),
        sa.Column("tariff_code", sa.String(32), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date()),
        sa.Column("flat_all_units_from_kwh", sa.Numeric(12, 2)),
        sa.Column("source_resolution", sa.String(255), nullable=False),
        sa.Column("source_url", sa.String(500)),
        sa.Column("scope_note", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("distributor IN ('EDESUR', 'EDENORTE', 'EDEESTE')", name="ck_tariffs_distributor"),
        sa.CheckConstraint("effective_to IS NULL OR effective_to >= effective_from", name="ck_tariffs_validity"),
        sa.CheckConstraint("flat_all_units_from_kwh IS NULL OR flat_all_units_from_kwh > 0", name="ck_tariffs_flat_pos"),
        sa.UniqueConstraint("distributor", "tariff_code", "effective_from", name="uq_tariffs_version"))
    # btree_gist ya existe desde 0005 (bills); se repite IF NOT EXISTS por seguridad.
    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    op.execute("ALTER TABLE tariffs ADD CONSTRAINT ex_tariffs_version_overlap EXCLUDE USING gist "
               "(distributor WITH =, tariff_code WITH =, daterange(effective_from, effective_to, '[]') WITH &&)")
    op.create_table("tariff_fixed_charges",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tariff_id", UUID(as_uuid=True), sa.ForeignKey("tariffs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_kwh", sa.Numeric(12, 2), nullable=False),
        sa.Column("to_kwh", sa.Numeric(12, 2)),
        sa.Column("amount_rd", sa.Numeric(12, 2), nullable=False),
        sa.CheckConstraint("from_kwh >= 0", name="ck_tariff_fixed_from_nonneg"),
        sa.CheckConstraint("to_kwh IS NULL OR to_kwh > from_kwh", name="ck_tariff_fixed_range"),
        sa.CheckConstraint("amount_rd >= 0", name="ck_tariff_fixed_amount_nonneg"),
        sa.UniqueConstraint("tariff_id", "from_kwh", name="uq_tariff_fixed_from"))
    op.create_index("ix_tariff_fixed_tariff", "tariff_fixed_charges", ["tariff_id"])
    op.create_table("tariff_blocks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tariff_id", UUID(as_uuid=True), sa.ForeignKey("tariffs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_kwh", sa.Numeric(12, 2), nullable=False),
        sa.Column("to_kwh", sa.Numeric(12, 2)),
        sa.Column("price_rd_per_kwh", sa.Numeric(12, 4), nullable=False),
        sa.CheckConstraint("from_kwh >= 0", name="ck_tariff_blocks_from_nonneg"),
        sa.CheckConstraint("to_kwh IS NULL OR to_kwh > from_kwh", name="ck_tariff_blocks_range"),
        sa.CheckConstraint("price_rd_per_kwh >= 0", name="ck_tariff_blocks_price_nonneg"),
        sa.UniqueConstraint("tariff_id", "from_kwh", name="uq_tariff_blocks_from"))
    op.create_index("ix_tariff_blocks_tariff", "tariff_blocks", ["tariff_id"])


def downgrade():
    op.drop_table("tariff_blocks")
    op.drop_table("tariff_fixed_charges")
    op.drop_table("tariffs")
    op.drop_table("home_goals")
    op.drop_table("meter_readings")
    # btree_gist se conserva: lo usa la restricción de facturas (0005).
