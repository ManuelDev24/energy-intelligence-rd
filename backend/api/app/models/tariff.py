import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (CheckConstraint, Date, DateTime, ForeignKey, Index, Numeric, String, UniqueConstraint, func,
                        literal_column)
from sqlalchemy.dialects.postgresql import UUID, ExcludeConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

TARIFF_DISTRIBUTORS = ("EDESUR", "EDENORTE", "EDEESTE")
_DIST_SQL = ", ".join(f"'{d}'" for d in TARIFF_DISTRIBUTORS)


class Tariff(Base):
    """Versión publicada de un pliego tarifario. Sin filas sembradas hasta tener datos oficiales."""
    __tablename__ = "tariffs"
    __table_args__ = (
        CheckConstraint(f"distributor IN ({_DIST_SQL})", name="ck_tariffs_distributor"),
        CheckConstraint("effective_to IS NULL OR effective_to >= effective_from", name="ck_tariffs_validity"),
        CheckConstraint("flat_all_units_from_kwh IS NULL OR flat_all_units_from_kwh > 0", name="ck_tariffs_flat_pos"),
        UniqueConstraint("distributor", "tariff_code", "effective_from", name="uq_tariffs_version"),
        ExcludeConstraint(("distributor", "="), ("tariff_code", "="),
                          (literal_column("daterange(effective_from, effective_to, '[]')"), "&&"),
                          name="ex_tariffs_version_overlap", using="gist"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    distributor: Mapped[str] = mapped_column(String(20), nullable=False)
    tariff_code: Mapped[str] = mapped_column(String(32), nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date)
    # Si el consumo mensual es >= este umbral, TODOS los kWh van al precio del bloque que lo contiene
    # (BTS-1: 701 kWh -> 4º rango sin escalonado). NULL = escalonado puro.
    flat_all_units_from_kwh: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    source_resolution: Mapped[str] = mapped_column(String(255), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(500))
    # Columna/alcance aplicados (p. ej. "Tarifas de Transición; SENI; facturas emitidas oct–dic 2026").
    scope_note: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    fixed_charges = relationship("TariffFixedCharge", back_populates="tariff", cascade="all, delete-orphan",
                                 order_by="TariffFixedCharge.from_kwh", lazy="selectin")
    blocks = relationship("TariffBlock", back_populates="tariff", cascade="all, delete-orphan",
                          order_by="TariffBlock.from_kwh", lazy="selectin")


class TariffFixedCharge(Base):
    """Cargo fijo por rango de consumo mensual (from_kwh, to_kwh]; se cobra uno solo, el que contiene el consumo."""
    __tablename__ = "tariff_fixed_charges"
    __table_args__ = (
        CheckConstraint("from_kwh >= 0", name="ck_tariff_fixed_from_nonneg"),
        CheckConstraint("to_kwh IS NULL OR to_kwh > from_kwh", name="ck_tariff_fixed_range"),
        CheckConstraint("amount_rd >= 0", name="ck_tariff_fixed_amount_nonneg"),
        UniqueConstraint("tariff_id", "from_kwh", name="uq_tariff_fixed_from"),
        Index("ix_tariff_fixed_tariff", "tariff_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tariff_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tariffs.id", ondelete="CASCADE"),
                                                 nullable=False)
    from_kwh: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    to_kwh: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    amount_rd: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    tariff = relationship("Tariff", back_populates="fixed_charges")


class TariffBlock(Base):
    """Bloque (from_kwh, to_kwh]; to_kwh NULL = sin tope."""
    __tablename__ = "tariff_blocks"
    __table_args__ = (
        CheckConstraint("from_kwh >= 0", name="ck_tariff_blocks_from_nonneg"),
        CheckConstraint("to_kwh IS NULL OR to_kwh > from_kwh", name="ck_tariff_blocks_range"),
        CheckConstraint("price_rd_per_kwh >= 0", name="ck_tariff_blocks_price_nonneg"),
        UniqueConstraint("tariff_id", "from_kwh", name="uq_tariff_blocks_from"),
        Index("ix_tariff_blocks_tariff", "tariff_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tariff_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tariffs.id", ondelete="CASCADE"),
                                                 nullable=False)
    from_kwh: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    to_kwh: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    price_rd_per_kwh: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)

    tariff = relationship("Tariff", back_populates="blocks")
