import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

DOCUMENT_KINDS = ("bill_photo", "bill_pdf")
UPLOADED_VIA = ("web", "mobile", "api")


class Document(Base):
    """ERD-DB-DOCUMENTS: original de una factura (foto o PDF). El contenido vive en el almacenamiento privado
    (ERD-STORE-01); aquí solo metadatos y procedencia, inmutables salvo la asociación única a una factura.
    Sin factura asociada caduca en `retention_until`; con factura vive mientras la factura exista."""
    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint("kind IN ('bill_photo', 'bill_pdf')", name="ck_documents_kind"),
        CheckConstraint("uploaded_via IN ('web', 'mobile', 'api')", name="ck_documents_uploaded_via"),
        CheckConstraint("size_bytes > 0", name="ck_documents_size_positive"),
        CheckConstraint("sha256 ~ '^[0-9a-f]{64}$'", name="ck_documents_sha256"),
        CheckConstraint("bill_id IS NOT NULL OR retention_until IS NOT NULL", name="ck_documents_unattached_expire"),
        Index("ix_documents_home", "home_id", "created_at"),
        Index("ix_documents_bill", "bill_id"),
        Index("ix_documents_retention", "retention_until", postgresql_where="bill_id IS NULL"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    home_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("homes.id", ondelete="CASCADE"), nullable=False)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    bill_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("bills.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    content_type: Mapped[str] = mapped_column(String(64), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    uploaded_via: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    retention_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class StorageDeletion(Base):
    """Cola de borrado de objetos. La llena un trigger al borrar cualquier fila de `documents` (por usuario, factura,
    vivienda o cuenta), de modo que ningún camino deja un archivo huérfano; la vacía el worker (ERD-WORKER-01)."""
    __tablename__ = "storage_deletions"
    __table_args__ = (Index("ix_storage_deletions_pending", "locked_until", postgresql_where="done_at IS NULL"),)

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    storage_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    enqueued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    last_error: Mapped[str | None] = mapped_column(Text)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
