"""Durable per-peer budgets, independent of the credential transaction."""
import hashlib
import hmac
import math
from datetime import timedelta

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import settings
from app.models.auth_abuse import AuthAbuseBucket
from app.services.errors import ApplicationError


class RateLimited(ApplicationError):
    status_code = 429
    code = "auth_rate_limited"

    def __init__(self, retry_after):
        super().__init__("Demasiados intentos; inténtalo más tarde")
        self.retry_after = retry_after


class AbuseUnavailable(ApplicationError):
    status_code = 503
    code = "auth_unavailable"


def bucket_key(operation, peer):
    # Domain separation from JWT signing; never persist raw peer/email/token.
    return hmac.new(settings.AUTH_SIGNING_KEY.encode(),
                    ("energy-rd:auth-abuse:v1:" + operation + ":" + peer).encode(),
                    hashlib.sha256).hexdigest()


def database_now(db):
    # Called AFTER acquiring row lock; statement/transaction time can be stale.
    return db.scalar(select(text("clock_timestamp()")))


def enforce(bind, operation, peer, limit):
    retry_after = None
    try:
        with Session(bind) as db, db.begin():
            db.execute(text("SET LOCAL lock_timeout = '2s'"))
            db.execute(text("SET LOCAL statement_timeout = '3s'"))
            key = bucket_key(operation, peer)
            db.execute(insert(AuthAbuseBucket).values(
                key=key, window_started_at=select(text("clock_timestamp()")).scalar_subquery(), attempts=0
            ).on_conflict_do_nothing(index_elements=[AuthAbuseBucket.key]))
            bucket = db.scalar(select(AuthAbuseBucket).where(AuthAbuseBucket.key == key).with_for_update())
            now = database_now(db)
            window = timedelta(seconds=settings.AUTH_ABUSE_WINDOW_SECONDS)
            if now >= bucket.window_started_at + window:
                bucket.window_started_at = now
                bucket.attempts = 0
            if bucket.attempts >= limit:
                retry_after = max(1, math.ceil((bucket.window_started_at + window - now).total_seconds()))
            else:
                bucket.attempts += 1
    except SQLAlchemyError:
        # No SQL, parameters, traceback, URL or request values in errors/logs.
        raise AbuseUnavailable("Autenticación temporalmente no disponible") from None
    if retry_after is not None:
        raise RateLimited(retry_after)
