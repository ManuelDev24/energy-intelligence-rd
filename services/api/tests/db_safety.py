"""Reject unsafe URLs before tests can create databases or drop schemas."""
import re

from sqlalchemy.engine import URL, make_url


def validate_test_database_url(test_url: str, application_url: str) -> URL:
    url = make_url(test_url)
    application = make_url(application_url)
    if url.get_backend_name() != "postgresql":
        raise ValueError("Tests require a dedicated PostgreSQL database")
    # Also makes the database identifier safe for CREATE DATABASE quoting.
    if (not url.database or len(url.database) > 63
            or not re.fullmatch(r"[A-Za-z0-9_]+_test", url.database)):
        raise ValueError("Test database name must be at most 63 characters, use letters/digits/underscores and end in _test")
    if url.database == application.database:
        raise ValueError("Test database must differ from the application database")
    return url
