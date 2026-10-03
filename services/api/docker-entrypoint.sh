#!/bin/sh
# Migra, siembra (idempotente, opcional) y arranca la API.
set -e
alembic upgrade head
if [ "${SEED_PILOT:-true}" = "true" ]; then
  python -m app.seed
fi
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
