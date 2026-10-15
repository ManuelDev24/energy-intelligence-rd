#!/usr/bin/env bash
# ERD-E2E-MAESTRO-AUTH: lanza `auth-flow.yaml` con un correo único por corrida. AUTORADO, NO EJECUTADO en este entorno.
#
# Requisitos previos:
#   - API con cuentas y base VACÍA (sin SEED_PILOT):  AUTH_ENABLED=true ENVIRONMENT=development docker compose up -d --wait postgres api
#   - Metro: EXPO_PUBLIC_AUTH_ENABLED=true EXPO_PUBLIC_API_URL=<url> npx expo start --port 8081  (iOS: --localhost y
#     NODE_OPTIONS=--dns-result-order=ipv4first)
#   - Simulador/emulador con Expo Go (o development build: pasar APP_ID) y Maestro instalado.
#
# Uso:  frontend-mobile/app/maestro/run-auth.sh android|ios
set -euo pipefail
cd "$(dirname "$0")"
PLATFORM="${1:-android}"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')"
case "$PLATFORM" in
  android) APP_ID=host.exp.exponent; EXPO_URL="exp://${LAN_IP}:8081" ;;
  ios) APP_ID=host.exp.Exponent; EXPO_URL="exp://127.0.0.1:8081" ;;
  *) echo "Uso: $0 android|ios" >&2; exit 2 ;;
esac
STAMP="$(date +%s)"
export EMAIL="maestro-${STAMP}@example.com"
export PASSWORD="clave-de-prueba-${STAMP}"
mkdir -p evidence/auth
maestro test -e APP_ID="$APP_ID" -e EXPO_URL="$EXPO_URL" -e EMAIL="$EMAIL" -e PASSWORD="$PASSWORD" auth-flow.yaml
