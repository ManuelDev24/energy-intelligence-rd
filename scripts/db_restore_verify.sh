#!/usr/bin/env bash
# ERD-OPS-DR: restaura un respaldo cifrado en una base DESECHABLE y verifica que es utilizable. Mide el tiempo (RTO).
#
#   uso: scripts/db_restore_verify.sh archivo.dump.age
#   AGE_IDENTITY_FILE   archivo con la clave PRIVADA age (obligatorio; vive FUERA del repo y del servidor de respaldo)
#   RESTORE_ADMIN_URL   conexión a un servidor donde crear la base desechable (por defecto DATABASE_URL del entorno)
#   STRICT_COUNTS=1     además exige igualdad de filas con el origen (solo si el origen estuvo quieto durante el respaldo)
#
# Nunca restaura sobre una base existente ni sobre la de producción: crea `restore_verify_<hora>_test` y la borra al
# terminar (también si falla). Verifica sha256, revisión de Alembic, huella del esquema, triggers/constraints críticos
# y que las tablas clave se pueden leer. Sale con 0 solo si todo coincide.
set -euo pipefail
umask 077
backup="${1:?Uso: scripts/db_restore_verify.sh archivo.dump.age}"
: "${AGE_IDENTITY_FILE:?Falta AGE_IDENTITY_FILE}"
[[ -r "$AGE_IDENTITY_FILE" ]] || { echo "No se puede leer AGE_IDENTITY_FILE" >&2; exit 2; }
admin="${RESTORE_ADMIN_URL:-${DATABASE_URL:?Falta RESTORE_ADMIN_URL o DATABASE_URL}}"
admin="${admin/+psycopg/}"
manifest="$backup.manifest.json"
[[ -r "$backup" && -r "$manifest" && -r "$backup.sha256" ]] || { echo "Faltan el respaldo, su manifiesto o su .sha256" >&2; exit 2; }

echo "· Integridad (sha256)…"
( cd "$(dirname "$backup")" && sha256sum --check --quiet "$(basename "$backup").sha256" )

db="restore_verify_$(date -u +%Y%m%d%H%M%S)_test"
# URL de la base desechable: misma conexión, otro nombre de base (respeta ?query de la URL original).
base="${admin%%\?*}"; query=""; [[ "$admin" == *\?* ]] && query="?${admin#*\?}"
target="${base%/*}/$db$query"
psql "$admin" -X -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$db\"" >/dev/null
cleanup() { psql "$admin" -X -c "DROP DATABASE IF EXISTS \"$db\"" >/dev/null 2>&1 || true; }
trap cleanup EXIT

start="$(date -u +%s.%N)"
echo "· Descifrando y restaurando en $db…"
age -d -i "$AGE_IDENTITY_FILE" "$backup" | pg_restore --exit-on-error --no-owner --no-acl -d "$target"
elapsed="$(awk -v s="$start" -v e="$(date -u +%s.%N)" 'BEGIN{printf "%.1f", e-s}')"

q() { psql "$target" -X -A -t -v ON_ERROR_STOP=1 -c "$1"; }
jq_get() { python3 -c "import json,sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])" "$manifest" "$1"; }
fail=0
check() { if [[ "$2" == "$3" ]]; then echo "  ✓ $1"; else echo "  ✗ $1 (esperado '$3', obtenido '$2')"; fail=1; fi; }

check "revisión de Alembic" "$(q 'SELECT version_num FROM alembic_version')" "$(jq_get alembic_revision)"
check "huella del esquema" "$(q "SELECT md5(string_agg(table_name||'.'||column_name||':'||data_type||':'||is_nullable, ',' ORDER BY table_name, ordinal_position)) FROM information_schema.columns WHERE table_schema='public'")" "$(jq_get schema_fingerprint)"
for t in users homes home_members bills bill_items bill_snapshots auth_sessions; do
  q "SELECT count(*) FROM $t" >/dev/null && echo "  ✓ tabla $t legible ($(q "SELECT count(*) FROM $t") filas)" || { echo "  ✗ tabla $t"; fail=1; }
done
if [[ "$(q "SELECT to_regclass('public.documents') IS NOT NULL")" == "t" ]]; then
  check "triggers de documentos" "$(q "SELECT count(*) FROM pg_trigger WHERE tgname IN ('trg_documents_guard','trg_documents_enqueue_deletion')")" "2"
fi
check "restricciones sin validar" "$(q "SELECT count(*) FROM pg_constraint WHERE NOT convalidated")" "0"
if [[ "${STRICT_COUNTS:-0}" == "1" ]]; then
  src="${DATABASE_URL:?STRICT_COUNTS necesita DATABASE_URL del origen}"; src="${src/+psycopg/}"
  for t in users homes bills; do
    check "filas de $t = origen" "$(q "SELECT count(*) FROM $t")" "$(psql "$src" -X -A -t -c "SELECT count(*) FROM $t")"
  done
fi
echo "· Tiempo de restauración (RTO medido): ${elapsed} s"
[[ $fail -eq 0 ]] && echo "RESULTADO: RESTAURACIÓN VERIFICADA" || { echo "RESULTADO: FALLÓ LA VERIFICACIÓN"; exit 1; }
