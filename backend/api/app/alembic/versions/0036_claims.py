"""ERD-CLAIM-01: reclamaciones (casos) con historial. RLS por vivienda; los eventos heredan la visibilidad de su caso."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0036"
down_revision = "0035"
branch_labels = None
depends_on = None

APP, WORKER = "erd_app", "erd_worker"


def upgrade():
    op.create_table(
        "claims",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("home_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("homes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("bill_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bills.id", ondelete="SET NULL")),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("status", sa.String(12), nullable=False, server_default="open"),
        sa.Column("subject", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("disputed_amount_dop", sa.Numeric(12, 2)),
        sa.Column("reference_number", sa.String(60)),
        sa.Column("evidence", postgresql.JSONB()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("closed_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("kind IN ('billing_error', 'consumption_dispute', 'outage_damage', 'service_quality', 'other')", name="ck_claims_kind"),
        sa.CheckConstraint("status IN ('open', 'in_review', 'resolved', 'closed')", name="ck_claims_status"),
        sa.CheckConstraint("char_length(subject) BETWEEN 3 AND 120", name="ck_claims_subject"),
        sa.CheckConstraint("char_length(description) BETWEEN 10 AND 2000", name="ck_claims_description"),
        sa.CheckConstraint("disputed_amount_dop IS NULL OR disputed_amount_dop > 0", name="ck_claims_amount_positive"),
        sa.CheckConstraint("evidence IS NULL OR octet_length(evidence::text) <= 16384", name="ck_claims_evidence_size"),
    )
    op.create_index("ix_claims_home", "claims", ["home_id", "created_at"])
    op.create_index("ix_claims_bill", "claims", ["bill_id"])
    op.create_index("ix_claims_created_by", "claims", ["created_by"])
    op.create_index("uq_claims_open_per_bill_kind", "claims", ["home_id", "bill_id", "kind"], unique=True,
                    postgresql_where=sa.text("status IN ('open', 'in_review') AND bill_id IS NOT NULL"))
    op.create_table(
        "claim_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("claim_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("claims.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(8), nullable=False),
        sa.Column("actor", sa.String(8), nullable=False, server_default="user"),
        sa.Column("note", sa.Text()),
        sa.Column("status_to", sa.String(12)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("kind IN ('created', 'note', 'status')", name="ck_claim_events_kind"),
        sa.CheckConstraint("actor IN ('user', 'support')", name="ck_claim_events_actor"),
        sa.CheckConstraint("note IS NULL OR char_length(note) <= 2000", name="ck_claim_events_note"),
    )
    op.create_index("ix_claim_events_claim", "claim_events", ["claim_id", "created_at"])
    for table in ("claims", "claim_events"):
        op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO {APP}, {WORKER}")
    op.execute("ALTER TABLE claims ENABLE ROW LEVEL SECURITY")
    op.execute(f"CREATE POLICY tenant_isolation ON claims TO {APP} USING (home_id = app_home()) WITH CHECK (home_id = app_home())")
    op.execute(f"CREATE POLICY worker_access ON claims TO {WORKER} USING (true) WITH CHECK (true)")
    op.execute("ALTER TABLE claim_events ENABLE ROW LEVEL SECURITY")
    exists = "EXISTS (SELECT 1 FROM claims c WHERE c.id = claim_events.claim_id)"
    op.execute(f"CREATE POLICY tenant_isolation ON claim_events TO {APP} USING ({exists}) WITH CHECK ({exists})")
    op.execute(f"CREATE POLICY worker_access ON claim_events TO {WORKER} USING (true) WITH CHECK (true)")


def downgrade():
    op.drop_table("claim_events")
    op.drop_table("claims")
