from sqlalchemy import CheckConstraint, Column, DateTime, Integer, String
from app.database import Base


class AuthAbuseBucket(Base):
    __tablename__ = "auth_abuse_buckets"
    __table_args__ = (CheckConstraint("attempts >= 0", name="ck_auth_abuse_attempts"),)
    key = Column(String(64), primary_key=True)
    window_started_at = Column(DateTime(timezone=True), nullable=False)
    attempts = Column(Integer, nullable=False)
