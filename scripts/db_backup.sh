#!/usr/bin/env bash
# ERD-OPS-DR: respaldo lógico CIFRADO de la base indicada por DATABASE_URL (Neon, staging o local).
#
#   DATABASE_URL            postgresql[+psycopg]://usuario:clave@host/base?sslmode=require   (obligatoria)
#   BACKUP_AGE_RECIPIENT    clave PÚBLICA age (age1…): la única que necesita el servidor que respalda (obligatoria)
#   BACKUP_DIR              destino (por defecto .local-backups/db)
#   BACKUP_LABEL            etiqueta de entorno en el nombre (staging|production|local; por defecto local)
#
# Nunca escribe el volcado en claro: pg_dump | age > archivo.partial. Genera .sha256 y .manifest.json (revisión de
# Alembic y huella estructural del esquema) que usa scripts/db_restore_verify.sh. La clave PRIVADA no debe estar aquí.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."

: "${DATABASE_URL:?Falta DATABASE_URL}"
: "${BACKUP_AGE_RECIPIENT:?Falta BACKUP_AGE_RECIPIENT (clave pública age1…)}"
[[ "$BACKUP_AGE_RECIPIENT" == age1* ]] || { echo "BACKUP_AGE_RECIPIENT debe ser una clave pública age1…" >&2; exit 2; }
[[ "$BACKUP_AGE_RECIPIENT" != AGE-SECRET-KEY-* ]] || { echo "Esa es una clave PRIVADA; usa la pública." >&2; exit 2; }
label="${BACKUP_LABEL:-local}"
[[ "$label" =~ ^[a-z0-9-]{1,20}$ ]] || { echo "BACKUP_LABEL inválida" >&2; exit 2; }
dir="${BACKUP_DIR:-.local-backups/db}"
mkdir -p "$dir"
url="${DATABASE_URL/+psycopg/}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$dir/energyrd-$label-$stamp.dump.age"
[[ ! -e "$target" ]] || { echo "El destino ya existe: $target" >&2; exit 1; }
partial="$target.partial"
trap 'rm -f "$partial"' EXIT

psql_q() { psql "$url" -X -A -t -v ON_ERROR_STOP=1 -c "$1"; }
fingerprint_sql="SELECT md5(string_agg(table_name||'.'||column_name||':'||data_type||':'||is_nullable, ',' ORDER BY table_name, ordinal_position))
                 FROM information_schema.columns WHERE table_schema='public'"
revision="$(psql_q 'SELECT version_num FROM alembic_version')"
fingerprint="$(psql_q "$fingerprint_sql")"
started="$(date -u +%s)"

pg_dump "$url" -Fc --no-owner --no-acl | age -r "$BACKUP_AGE_RECIPIENT" > "$partial"
mv "$partial" "$target"

size="$(stat -c %s "$target")"
( cd "$dir" && sha256sum "$(basename "$target")" > "$(basename "$target").sha256" )
cat > "$target.manifest.json" <<JSON
{"file": "$(basename "$target")", "label": "$label", "created_utc": "$stamp", "alembic_revision": "$revision",
 "schema_fingerprint": "$fingerprint", "size_bytes": $size, "duration_seconds": $(( $(date -u +%s) - started )),
 "pg_dump": "$(pg_dump --version | tr -d '\n')", "encryption": "age (clave pública del destinatario)"}
JSON
echo "Respaldo cifrado: $target ($size bytes, revisión $revision)"
