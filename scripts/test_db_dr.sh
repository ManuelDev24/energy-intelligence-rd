#!/usr/bin/env bash
# ERD-OPS-DR: autoprueba del respaldo/restauración contra un PostgreSQL LOCAL desechable (no usar con producción).
#   uso: ADMIN_URL=postgresql://usuario:clave@localhost:5432/postgres scripts/test_db_dr.sh
# Crea una base de origen con el esquema actual, respalda cifrado, restaura y verifica; y comprueba que los fallos
# (archivo manipulado, clave equivocada, manifiesto ausente) NO dan "verificada" y no dejan bases huérfanas.
set -euo pipefail
cd "$(dirname "$0")/.."
admin="${ADMIN_URL:?Falta ADMIN_URL (postgresql://…/postgres)}"
case "$admin" in *localhost*|*127.0.0.1*) ;; *) echo "Solo contra un PostgreSQL local." >&2; exit 2;; esac
work="$(mktemp -d)"; src="dr_selftest_source_$$_test"
cleanup() { psql "$admin" -X -c "DROP DATABASE IF EXISTS \"$src\"" >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT
pass=0; fail=0
ok() { echo "  ✓ $1"; pass=$((pass+1)); }
bad() { echo "  ✗ $1"; fail=$((fail+1)); }
expect_fail() { local name="$1"; shift; if "$@" >"$work/out.txt" 2>&1; then bad "$name (debía fallar)"; else ok "$name"; fi; }

psql "$admin" -X -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$src\"" >/dev/null
src_url="${admin%/*}/$src"
( cd services/api && DATABASE_URL="${src_url/postgresql:/postgresql+psycopg:}" uv run --frozen alembic upgrade head >/dev/null 2>&1 )
psql "$src_url" -X -q -c "INSERT INTO users(id,email,password_hash) VALUES (gen_random_uuid(),'dr@example.com','x');
  INSERT INTO homes(id,name,distributor) VALUES (gen_random_uuid(),'Casa DR','EDESUR');" >/dev/null
age-keygen -o "$work/id.txt" >/dev/null 2>&1; pub="$(grep 'public key' "$work/id.txt" | awk '{print $NF}')"
age-keygen -o "$work/other.txt" >/dev/null 2>&1

echo "Caso feliz"
DATABASE_URL="$src_url" BACKUP_AGE_RECIPIENT="$pub" BACKUP_DIR="$work/out" scripts/db_backup.sh >/dev/null && ok "respaldo creado" || bad "respaldo"
file="$(ls "$work"/out/*.dump.age)"
grep -q "PGDMP" "$file" && bad "el archivo contiene el volcado en claro" || ok "el archivo no contiene el volcado en claro"
[[ "$(stat -c %a "$file")" == "600" ]] && ok "permisos 600" || bad "permisos del respaldo"
AGE_IDENTITY_FILE="$work/id.txt" DATABASE_URL="$src_url" STRICT_COUNTS=1 scripts/db_restore_verify.sh "$file" | grep -q "RESTAURACIÓN VERIFICADA" && ok "restauración verificada" || bad "restauración"

echo "Casos de fallo"
expect_fail "sin clave pública no respalda" env -u BACKUP_AGE_RECIPIENT DATABASE_URL="$src_url" BACKUP_DIR="$work/o2" scripts/db_backup.sh
expect_fail "rechaza una clave privada como destinatario" env DATABASE_URL="$src_url" BACKUP_AGE_RECIPIENT="$(grep AGE-SECRET-KEY "$work/id.txt")" BACKUP_DIR="$work/o2" scripts/db_backup.sh
expect_fail "clave equivocada no restaura" env AGE_IDENTITY_FILE="$work/other.txt" DATABASE_URL="$src_url" scripts/db_restore_verify.sh "$file"
cp "$file" "$work/tampered.dump.age"; cp "$file.sha256" "$work/tampered.dump.age.sha256"; cp "$file.manifest.json" "$work/tampered.dump.age.manifest.json"
sed -i "s/$(basename "$file")/tampered.dump.age/" "$work/tampered.dump.age.sha256"
printf 'X' | dd of="$work/tampered.dump.age" bs=1 seek=200 conv=notrunc 2>/dev/null
expect_fail "archivo manipulado falla en sha256" env AGE_IDENTITY_FILE="$work/id.txt" DATABASE_URL="$src_url" scripts/db_restore_verify.sh "$work/tampered.dump.age"
rm "$file.manifest.json"
expect_fail "sin manifiesto no restaura" env AGE_IDENTITY_FILE="$work/id.txt" DATABASE_URL="$src_url" scripts/db_restore_verify.sh "$file"
orphans="$(psql "$admin" -X -A -t -c "SELECT count(*) FROM pg_database WHERE datname LIKE 'restore_verify_%'")"
[[ "$orphans" == "0" ]] && ok "no quedan bases desechables huérfanas" || bad "$orphans bases huérfanas"

echo "Resultado: $pass ok, $fail fallos"
[[ $fail -eq 0 ]]
