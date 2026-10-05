#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
target="${1:-.local-backups/pilot-$(date +%Y%m%d-%H%M%S).dump}"
mkdir -p "$(dirname "$target")"
if [[ -e "$target" ]]; then
  echo "El destino ya existe; elige otro archivo." >&2
  exit 1
fi
partial="${target}.partial"
trap 'rm -f "$partial"' EXIT
docker compose exec -T postgres sh -c 'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$partial"
mv "$partial" "$target"
echo "Backup guardado: $target"
