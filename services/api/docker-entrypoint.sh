#!/bin/sh
# Migra, siembra (idempotente, opcional) y arranca la API.
set -e
# Validate configuration before any migration or demo write.
python -c 'from app.config import settings'
python -c 'from app.config import settings; from alembic import command; from alembic.config import Config; command.upgrade(Config("alembic.ini"), "head") if settings.MIGRATE_ON_START else None'
python -c 'from app.config import settings; from app.seed import main; main() if settings.SEED_PILOT else None'
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-proxy-headers
