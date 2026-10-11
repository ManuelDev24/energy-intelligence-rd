from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, Index, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

JOB_STATUSES = ("queued", "running", "succeeded", "dead")


class Job(Base):
    """ERD-WORKER-01: un trabajo en segundo plano. `payload` solo lleva identificadores (nunca contenido ni datos
    personales). `dead` es la cola de mensajes muertos: se queda hasta que alguien lo reencola o vence la retención."""
    __tablename__ = "jobs"
    __table_args__ = (
        CheckConstraint("status IN ('queued', 'running', 'succeeded', 'dead')", name="ck_jobs_status"),
        CheckConstraint("max_attempts BETWEEN 1 AND 20", name="ck_jobs_max_attempts"),
        CheckConstraint("attempts >= 0 AND attempts <= max_attempts", name="ck_jobs_attempts"),
        CheckConstraint("kind ~ '^[a-z][a-z0-9_.-]{0,63}$'", name="ck_jobs_kind"),
        CheckConstraint("jsonb_typeof(payload) = 'object' AND octet_length(payload::text) <= 8192", name="ck_jobs_payload"),
        CheckConstraint("status <> 'running' OR (locked_by IS NOT NULL AND locked_until IS NOT NULL)", name="ck_jobs_running_lease"),
        CheckConstraint("(status IN ('succeeded', 'dead')) = (finished_at IS NOT NULL)", name="ck_jobs_finished"),
        Index("uq_jobs_idempotency", "kind", "idempotency_key", unique=True, postgresql_where=text("idempotency_key IS NOT NULL")),
        Index("ix_jobs_due", "run_at", "id", postgresql_where=text("status = 'queued'")),
        Index("ix_jobs_leases", "locked_until", postgresql_where=text("status = 'running'")),
        Index("ix_jobs_finished", "status", "finished_at", postgresql_where=text("finished_at IS NOT NULL")),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    idempotency_key: Mapped[str | None] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="queued", server_default="queued")
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    max_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=5, server_default="5")
    run_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    locked_by: Mapped[str | None] = mapped_column(String(96))
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
