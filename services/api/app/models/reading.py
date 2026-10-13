import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class MeterReading(Base):
    """Lectura acumulada del medidor. La monotonía por vivienda se valida en el servicio.

    No se soporta reemplazo de medidor: una lectura menor que la anterior se rechaza.
    """
    __tablename__ = "meter_readings"
    __table_args__ = (
        CheckConstraint("reading_kwh >= 0", name="ck_meter_readings_kwh_nonneg"),
        CheckConstraint("source IN ('manual')", name="ck_meter_readings_source"),
        # El índice único también sirve para consultas por vivienda y rango de fechas.
        UniqueConstraint("home_id", "read_at", name="uq_meter_readings_home_read_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    home_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("homes.id", ondelete="CASCADE"),
                                               nullable=False)
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reading_kwh: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="manual", server_default="manual")
    note: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
