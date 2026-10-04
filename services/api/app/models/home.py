import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

DISTRIBUTORS = ("EDESUR", "EDENORTE", "EDEESTE", "Otra")
_DIST_SQL = ", ".join(f"'{d}'" for d in DISTRIBUTORS)


class Home(Base):
    __tablename__ = "homes"
    __table_args__ = (
        CheckConstraint(f"distributor IN ({_DIST_SQL})", name="ck_homes_distributor"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Clave estable opcional (p. ej. PILOT-01); permite seeds idempotentes.
    code: Mapped[str | None] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    address: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(120))
    distributor: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    bills = relationship("Bill", back_populates="home", cascade="all, delete-orphan")
    alerts = relationship("Alert", back_populates="home", cascade="all, delete-orphan")
    equipment = relationship("Equipment", back_populates="home", cascade="all, delete-orphan")
    alert_settings = relationship("AlertSettings", back_populates="home", cascade="all, delete-orphan",
                                  uselist=False)
