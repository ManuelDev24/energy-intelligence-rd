#!/usr/bin/env bash
# Smoke test móvil (ERD-MOB-QUALITY) sobre Expo Go con Maestro.
#
# Requisitos previos:
#   - API sembrada:      docker compose up -d --wait postgres api   (seed automático)
#   - Metro:             cd apps/mobile && EXPO_PUBLIC_API_URL=<url> npx expo start --port 8081
#   - Simulador/emulador con Expo Go instalado (expo start --android / --ios lo instala)
#   - Maestro:           brew install mobile-dev-inc/tap/maestro
#
# Uso:  apps/mobile/maestro/run-smoke.sh android|ios
# Las capturas quedan en apps/mobile/maestro/evidence/.
set -euo pipefail
cd "$(dirname "$0")"

PLATFORM="${1:-android}"
LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}')"

case "$PLATFORM" in
  android)
    APP_ID=host.exp.exponent
    EXPO_URL="exp://${LAN_IP}:8081"
    ADB="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
    # Estado limpio (onboarding desde cero). Se hace con adb porque el clearState de Maestro
    # corta la conexión adb en algunos emuladores.
    "$ADB" shell pm clear "$APP_ID" >/dev/null
    "$ADB" shell settings put secure stylus_handwriting_enabled 0 || true  # evita el tutorial de stylus
    ;;
  ios)
    APP_ID=host.exp.Exponent
    EXPO_URL="exp://127.0.0.1:8081"
    xcrun simctl terminate booted "$APP_ID" 2>/dev/null || true
    xcrun simctl privacy booted reset all "$APP_ID" 2>/dev/null || true
    # Reinstalar Expo Go no es necesario: el flujo borra la sesión saltando el onboarding guardado.
    ;;
  *) echo "uso: $0 android|ios" >&2; exit 2 ;;
esac

mkdir -p evidence
MAESTRO_CLI_NO_ANALYTICS=1 maestro test -e APP_ID="$APP_ID" -e EXPO_URL="$EXPO_URL" pilot-flow.yaml
