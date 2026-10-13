import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Contract(Base):
    """Service account for a home; distributor remains on the home."""
    __tablename__ = 'contracts'
    __table_args__ = (CheckConstraint("length(trim(account_number)) > 0", name='ck_contracts_account_number_nonempty'),)

    home_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey('homes.id', ondelete='CASCADE'), primary_key=True)
    account_number: Mapped[str] = mapped_column(String(120), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(),
                                                 onupdate=func.now(), nullable=False)
