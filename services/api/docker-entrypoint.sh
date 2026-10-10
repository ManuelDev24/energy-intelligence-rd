#!/bin/sh
# Valida la configuración y luego:
#  - con argumentos, ejecuta ese comando (p. ej. el paso único de release `alembic upgrade head`
#    de Render preDeployCommand o del servicio `migrate` de docker compose), sin arrancar la API;
#  - sin argumentos, migra/siembra solo si se pidió (desarrollo local) y arranca la API.
set -e
# Validate configuration before any migration or demo write.
python -c 'from app.config import settings'
if [ "$#" -gt 0 ]; then
  exec "$@"
fi
python -c 'from app.config import settings; from alembic import command; from alembic.config import Config; command.upgrade(Config("alembic.ini"), "head") if settings.MIGRATE_ON_START else None'
python -c 'from app.config import settings; from app.seed import main; main() if settings.SEED_PILOT else None'
# Render inyecta PORT; en local (docker compose) se mantiene 8000.
# --no-proxy-headers es deliberado: ver services/api/AUTH_ABUSE_PROTECTION.md («Proxy y despliegue»).
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --no-proxy-headers
