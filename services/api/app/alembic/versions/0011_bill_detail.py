"""Manual bill detail; no tariff/concept data."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("bill_snapshots",
        sa.Column("bill_id", UUID(as_uuid=True), sa.ForeignKey("bills.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("origin", sa.String(16), nullable=False),
        sa.Column("data", JSONB(), nullable=False),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("origin IN ('creation', 'migration')", name="ck_bill_snapshots_origin"))
    op.execute("""INSERT INTO bill_snapshots(bill_id,origin,data)
                  SELECT b.id,'migration',to_jsonb(b) FROM bills b""")
    op.execute("""CREATE FUNCTION prevent_bill_snapshot_update() RETURNS trigger LANGUAGE plpgsql AS $$
                  BEGIN
                    IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM bills WHERE id=OLD.bill_id) THEN
                      RETURN OLD;
                    END IF;
                    RAISE EXCEPTION 'Bill snapshots are immutable' USING ERRCODE='23514';
                  END; $$""")
    op.execute("""CREATE TRIGGER bill_snapshot_immutable BEFORE UPDATE OR DELETE ON bill_snapshots
                  FOR EACH ROW EXECUTE FUNCTION prevent_bill_snapshot_update()""")
    # Row triggers never fire on TRUNCATE: a statement trigger closes that path to the originals.
    op.execute("""CREATE FUNCTION prevent_bill_snapshot_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
                  BEGIN
                    RAISE EXCEPTION 'Bill snapshots are immutable' USING ERRCODE='23514';
                  END; $$""")
    op.execute("""CREATE TRIGGER bill_snapshot_no_truncate BEFORE TRUNCATE ON bill_snapshots
                  FOR EACH STATEMENT EXECUTE FUNCTION prevent_bill_snapshot_truncate()""")
    op.create_table("bill_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("bill_id", UUID(as_uuid=True), sa.ForeignKey("bills.id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("amount_dop", sa.Numeric(12, 2), nullable=False),
        sa.UniqueConstraint("bill_id", "position", name="uq_bill_items_position"),
        sa.CheckConstraint("position >= 0 AND position < 100", name="ck_bill_items_position"),
        sa.CheckConstraint("amount_dop != 'NaN'::numeric", name="ck_bill_items_finite"),
        sa.CheckConstraint("length(trim(label)) > 0", name="ck_bill_items_label"),
        sa.CheckConstraint("(kind = 'charge' AND amount_dop >= 0) OR (kind = 'discount' AND amount_dop <= 0)", name="ck_bill_items_sign"))


def downgrade():
    op.drop_table("bill_items")
    op.drop_table("bill_snapshots")
    op.execute("DROP FUNCTION prevent_bill_snapshot_update()")
    op.execute("DROP FUNCTION prevent_bill_snapshot_truncate()")
