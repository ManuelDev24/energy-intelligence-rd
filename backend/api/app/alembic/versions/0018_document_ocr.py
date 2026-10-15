"""ERD-OCR-PROD: estado del OCR por documento (una fila por original) y borrador leído mientras se confirma.

El borrador (campos leídos + extracto del texto) se guarda solo hasta que la persona confirma la factura o el documento
caduca/se borra (la fila cae en cascada con `documents`). Nunca se guarda el texto completo del OCR.
Downgrade elimina la tabla: se pierden los borradores pendientes, los originales siguen en `documents`.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "document_ocr",
        sa.Column("document_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("status", sa.String(12), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("engine", sa.String(24)),
        sa.Column("method", sa.String(16)),
        sa.Column("pages_read", sa.Integer),
        sa.Column("pages_total", sa.Integer),
        sa.Column("draft", postgresql.JSONB),
        sa.Column("error_code", sa.String(24)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("status IN ('pending', 'processing', 'done', 'failed')", name="ck_document_ocr_status"),
        sa.CheckConstraint("status <> 'failed' OR error_code IS NOT NULL", name="ck_document_ocr_failed_code"),
        sa.CheckConstraint("method IS NULL OR method IN ('text_layer', 'ocr', 'mixed')", name="ck_document_ocr_method"),
        sa.CheckConstraint("pages_read IS NULL OR (pages_read >= 0 AND pages_total >= pages_read)", name="ck_document_ocr_pages"),
        sa.CheckConstraint("draft IS NULL OR octet_length(draft::text) <= 16384", name="ck_document_ocr_draft_size"),
    )


def downgrade():
    op.drop_table("document_ocr")
