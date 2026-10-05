#!/usr/bin/env bash
# Restore only into a new disposable database; never overwrite the pilot.
set -euo pipefail
cd "$(dirname "$0")/.."
backup="${1:?Uso: scripts/restore_drill.sh archivo.dump [base_restore_test]}"
database="${2:-energy_restore_test}"
if [[ ! "$database" =~ ^[a-zA-Z0-9_]+_test$ || ${#database} -gt 63 ]]; then
  echo "La base desechable debe terminar en _test (máximo 63 caracteres)." >&2; exit 1
fi
# createdb fails if the destination exists; no DROP or --clean before restoring.
docker compose exec -T postgres sh -c 'test "$1" != "$POSTGRES_DB" && exec createdb -U "$POSTGRES_USER" "$1"' sh "$database"
cleanup() { docker compose exec -T postgres sh -c 'exec dropdb -U "$POSTGRES_USER" "$1"' sh "$database"; }
trap cleanup EXIT
docker compose exec -T postgres sh -c 'exec pg_restore --exit-on-error -U "$POSTGRES_USER" -d "$1"' sh "$database" < "$backup"
docker compose exec -T postgres sh -c 'exec psql -U "$POSTGRES_USER" -d "$1" -v ON_ERROR_STOP=1 -c "SELECT count(*) AS homes FROM homes; SELECT count(*) AS bills FROM bills; SELECT version_num FROM alembic_version;"' sh "$database"
