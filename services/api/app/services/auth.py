"""Password and session primitives. Refresh history is retained to detect reuse."""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from sqlalchemy import select

from app.config import settings
from app.models.auth import AuthSession, RefreshToken, User
from app.services.errors import Unauthorized
from app.services.legal import LEGAL_TERMS_VERSION
from app.services.transactions import write_transaction

password_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=4)
# Equal-cost verify for missing users. This is not a signing key or usable account.
_dummy_hash = password_hasher.hash(secrets.token_urlsafe(32))


def now():
    return datetime.now(timezone.utc)


def unauthorized():
    return Unauthorized("Credenciales inválidas")


def hash_token(token):
    return hashlib.sha256(token.encode("ascii")).hexdigest()


def issue_tokens(db, user, session):
    issued = now()
    refresh = secrets.token_urlsafe(32)
    db.add(RefreshToken(token_hash=hash_token(refresh), session_id=session.id))
    access = jwt.encode({"sub": str(user.id), "sid": str(session.id), "jti": str(uuid.uuid4()),
                         "iat": issued, "nbf": issued,
                         "exp": issued + timedelta(seconds=settings.AUTH_ACCESS_TTL_SECONDS),
                         "iss": settings.AUTH_ISSUER, "aud": settings.AUTH_AUDIENCE,
                         "type": "access"}, settings.AUTH_SIGNING_KEY, algorithm="HS256")
    return {"access_token": access, "refresh_token": refresh, "token_type": "bearer",
            "expires_in": settings.AUTH_ACCESS_TTL_SECONDS}


def new_session(db, user):
    session = AuthSession(user_id=user.id, expires_at=now() + timedelta(days=settings.AUTH_REFRESH_TTL_DAYS))
    db.add(session)
    db.flush()
    return issue_tokens(db, user, session)


def verify_password(user, password):
    """Constant-shape Argon2 check; never raises on malformed hashes."""
    try:
        return password_hasher.verify(user.password_hash if user else _dummy_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def register(db, credentials):
    # accept_terms=True is enforced by the schema; the accepted version is always the server's.
    with write_transaction(db):
        user = User(email=credentials.email,
                    password_hash=password_hasher.hash(credentials.password.get_secret_value()), role="user",
                    terms_version=LEGAL_TERMS_VERSION, terms_accepted_at=now())
        db.add(user)
        db.flush()
        tokens = new_session(db, user)
    return tokens


def login(db, credentials):
    user = db.scalar(select(User).where(User.email == credentials.email))
    verified_hash = user.password_hash if user else None
    valid = verify_password(user, credentials.password.get_secret_value())
    if not valid or user is None or not user.active:
        raise unauthorized()
    with write_transaction(db):
        # Serialize issuance with reset/erasure; refresh the identity-map copy.
        user = db.scalar(select(User).where(User.id == user.id).with_for_update()
                         .execution_options(populate_existing=True))
        if user is None or not user.active or user.password_hash != verified_hash:
            raise unauthorized()
        if password_hasher.check_needs_rehash(user.password_hash):
            user.password_hash = password_hasher.hash(credentials.password.get_secret_value())
        tokens = new_session(db, user)
    return tokens


def resolve_access(db, token):
    return resolve_access_session(db, token)[0]


def resolve_access_session(db, token):
    """Usuario y sesión a la que pertenece el access token (la sesión permite marcar «esta sesión» y no cerrarla)."""
    if len(token) > 4096:
        raise unauthorized()
    try:
        claims = jwt.decode(token, settings.AUTH_SIGNING_KEY, algorithms=["HS256"],
                            audience=settings.AUTH_AUDIENCE, issuer=settings.AUTH_ISSUER,
                            options={"require": ["exp", "iat", "nbf", "sub", "sid", "jti", "iss", "aud", "type"]})
        if claims["type"] != "access":
            raise ValueError("wrong token type")
        uid, sid = uuid.UUID(claims["sub"]), uuid.UUID(claims["sid"])
    except (jwt.InvalidTokenError, ValueError, TypeError, AttributeError):
        raise unauthorized() from None
    session = db.get(AuthSession, sid)
    user = db.get(User, uid)
    if (not session or session.user_id != uid or session.revoked_at is not None
            or session.expires_at <= now() or not user or not user.active):
        raise unauthorized()
    return user, session


def refresh_or_logout(db, token, *, logout=False):
    # All rotations/reuse/logout for this family serialize on the same session row.
    token_hash = hash_token(token)
    sid = db.scalar(select(RefreshToken.session_id).where(RefreshToken.token_hash == token_hash))
    if sid is None:
        raise unauthorized()
    invalid = False
    tokens = None
    with write_transaction(db):
        session = db.scalar(select(AuthSession).where(AuthSession.id == sid).with_for_update()
                            .execution_options(populate_existing=True))
        record = db.get(RefreshToken, token_hash, populate_existing=True)
        user = db.get(User, session.user_id)
        if logout:
            session.revoked_at = session.revoked_at or now()
        elif (session.revoked_at or session.expires_at <= now() or record.consumed_at
              or not user or not user.active):
            session.revoked_at = session.revoked_at or now()
            invalid = True
        else:
            record.consumed_at = now()
            tokens = issue_tokens(db, user, session)
    # Raise only after committing family revocation, never roll it back.
    if invalid:
        raise unauthorized()
    return tokens
