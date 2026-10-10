"""ERD-DB-DOCUMENTS: originales de factura (`documents`) y cola de borrado de objetos (`storage_deletions`).

Un trigger encola la clave de almacenamiento al borrar cualquier documento (incluidos los borrados en cascada por
factura, vivienda o cuenta). Otro mantiene inmutables hash, clave, tamaño, tipo, vivienda y autor, y solo permite
asociar el documento una vez a una factura de su misma vivienda.
Downgrade elimina ambas tablas y sus funciones: los archivos ya subidos quedarían sin metadatos, así que solo es
seguro antes de ERD-STORE-01 o tras vaciar el almacenamiento.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("home_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("homes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("bill_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bills.id", ondelete="CASCADE")),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("content_type", sa.String(64), nullable=False),
        sa.Column("size_bytes", sa.BigInteger, nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("storage_key", sa.String(255), nullable=False, unique=True),
        sa.Column("uploaded_via", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("retention_until", sa.DateTime(timezone=True)),
        sa.CheckConstraint("kind IN ('bill_photo', 'bill_pdf')", name="ck_documents_kind"),
        sa.CheckConstraint("uploaded_via IN ('web', 'mobile', 'api')", name="ck_documents_uploaded_via"),
        sa.CheckConstraint("size_bytes > 0", name="ck_documents_size_positive"),
        sa.CheckConstraint("sha256 ~ '^[0-9a-f]{64}$'", name="ck_documents_sha256"),
        sa.CheckConstraint("bill_id IS NOT NULL OR retention_until IS NOT NULL", name="ck_documents_unattached_expire"),
    )
    op.create_index("ix_documents_home", "documents", ["home_id", "created_at"])
    op.create_index("ix_documents_bill", "documents", ["bill_id"])
    op.create_index("ix_documents_retention", "documents", ["retention_until"], postgresql_where=sa.text("bill_id IS NULL"))
    op.create_table(
        "storage_deletions",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("storage_key", sa.String(255), nullable=False, unique=True),
        sa.Column("enqueued_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text),
        sa.Column("locked_until", sa.DateTime(timezone=True)),
        sa.Column("done_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_storage_deletions_pending", "storage_deletions", ["locked_until"],
                    postgresql_where=sa.text("done_at IS NULL"))
    op.execute("""
        CREATE FUNCTION documents_enqueue_storage_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            INSERT INTO storage_deletions(storage_key) VALUES (OLD.storage_key) ON CONFLICT (storage_key) DO NOTHING;
            RETURN OLD;
        END $$;
    """)
    op.execute("CREATE TRIGGER trg_documents_enqueue_deletion AFTER DELETE ON documents "
               "FOR EACH ROW EXECUTE FUNCTION documents_enqueue_storage_deletion()")
    op.execute("""
        CREATE FUNCTION documents_guard() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF TG_OP = 'UPDATE' THEN
                IF NEW.id IS DISTINCT FROM OLD.id OR NEW.home_id IS DISTINCT FROM OLD.home_id
                   OR NEW.uploaded_by IS DISTINCT FROM OLD.uploaded_by AND NEW.uploaded_by IS NOT NULL
                   OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.content_type IS DISTINCT FROM OLD.content_type
                   OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes OR NEW.sha256 IS DISTINCT FROM OLD.sha256
                   OR NEW.storage_key IS DISTINCT FROM OLD.storage_key OR NEW.uploaded_via IS DISTINCT FROM OLD.uploaded_via
                   OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
                    RAISE EXCEPTION 'documents: provenance columns are immutable' USING ERRCODE = '23514';
                END IF;
                IF OLD.bill_id IS NOT NULL AND NEW.bill_id IS DISTINCT FROM OLD.bill_id THEN
                    RAISE EXCEPTION 'documents: a document can only be attached once' USING ERRCODE = '23514';
                END IF;
            END IF;
            IF NEW.bill_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM bills WHERE id = NEW.bill_id AND home_id = NEW.home_id) THEN
                RAISE EXCEPTION 'documents: bill belongs to another home' USING ERRCODE = '23514';
            END IF;
            RETURN NEW;
        END $$;
    """)
    op.execute("CREATE TRIGGER trg_documents_guard BEFORE INSERT OR UPDATE ON documents "
               "FOR EACH ROW EXECUTE FUNCTION documents_guard()")


def downgrade():
    op.execute("DROP TRIGGER IF EXISTS trg_documents_guard ON documents")
    op.execute("DROP TRIGGER IF EXISTS trg_documents_enqueue_deletion ON documents")
    op.execute("DROP FUNCTION IF EXISTS documents_guard()")
    op.execute("DROP FUNCTION IF EXISTS documents_enqueue_storage_deletion()")
    op.drop_index("ix_storage_deletions_pending", table_name="storage_deletions")
    op.drop_table("storage_deletions")
    op.drop_index("ix_documents_retention", table_name="documents")
    op.drop_index("ix_documents_bill", table_name="documents")
    op.drop_index("ix_documents_home", table_name="documents")
    op.drop_table("documents")
