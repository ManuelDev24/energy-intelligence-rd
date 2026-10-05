import logging

from fastapi import Depends, Request
from sqlalchemy.orm import Session
from app.api.auth_deps import auth_required
from app.config import settings
from app.database import get_db
from app.services.auth_abuse import enforce
from app.services.client_ip import verify_signed_client_ip

logger = logging.getLogger("energyrd.api")


def resolve_client_ip(request: Request) -> str:
    """Peer used as the abuse-budget key.

    CLIENT_IP_SOURCE='socket' (default) keeps the historical behaviour: the raw
    TCP peer, never headers (uvicorn runs with --no-proxy-headers; Render only
    APPENDS to a client-supplied X-Forwarded-For, so trusting it directly would
    be spoofable).

    CLIENT_IP_SOURCE='cf-connecting-ip' is safe ONLY because this deployment's
    topology guarantees Cloudflare sits directly in front of Render and
    Cloudflare itself sets/overwrites CF-Connecting-IP at its edge (it never
    forwards a client-supplied value). Do not flip this setting behind any
    other proxy without re-verifying that guarantee.

    Within that mode, a second trust boundary applies to the single shared
    BFF->API connection: an HMAC-signed, timestamped `X-Forwarded-Client-Ip`
    header (verified against BFF_API_SHARED_SECRET) carries the REAL browser
    IP and takes priority over CF-Connecting-IP, since CF-Connecting-IP would
    otherwise be the BFF's own IP for every browser. An unsigned or invalid
    header is never trusted; it falls back to CF-Connecting-IP, and finally to
    the socket peer (logged, never raises) if that header is also absent.
    """
    socket_peer = request.client.host if request.client else "unknown-peer"
    if settings.CLIENT_IP_SOURCE == "socket":
        return socket_peer
    signed = request.headers.get("X-Forwarded-Client-Ip")
    if signed and settings.BFF_API_SHARED_SECRET:
        verified = verify_signed_client_ip(signed, settings.BFF_API_SHARED_SECRET)
        if verified:
            return verified
    cf = request.headers.get("CF-Connecting-IP")
    if cf:
        return cf
    logger.warning("client_ip_fallback_to_socket", extra={"extra_fields": {"reason": "missing_cf_connecting_ip"}})
    return socket_peer


def budget(operation):
    def dependency(request: Request, db: Session = Depends(get_db), _=Depends(auth_required)):
        peer = resolve_client_ip(request)
        enforce(db.get_bind(), operation, peer, getattr(settings, f"AUTH_{operation.upper()}_LIMIT"))
    return dependency


login_budget = budget("login")
register_budget = budget("register")
refresh_budget = budget("refresh")
forgot_budget = budget("forgot")
reset_budget = budget("reset")
