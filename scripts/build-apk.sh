#!/usr/bin/env bash
# ===========================================================================
# Lozkho Stereo — Construcción del APK de Android (TWA vía Bubblewrap)
# ===========================================================================
# Genera un APK instalable en Android 10+ usando Bubblewrap (Trusted Web Activity).
#
# El flujo es:
#   1. Compilar el static export (./out) con `bun run build`.
#   2. Servir ./out localmente (con `npx serve`).
#   3. Inicializar Bubblewrap en android/ con `bubblewrap init --manifest=...`
#      apuntando a la URL local.
#   4. `bubblewrap build` genera app-release-signed.apk (si hay keystore) o
#      app-release-unsigned.apk.
#
# REQUISITOS
# ----------
# - Node.js >= 18 (incluido en este entorno)
# - Bubblewrap CLI: `npm install -g @bubblewrap/cli`
# - Android SDK (ANDROID_HOME) con build-tools y platform-tools
# - Java JDK 17+ (ya instalado en este entorno: OpenJDK 21)
# - Para publicar en Play Store: un keystore de firma (ver SECRETS.md)
#
# USO
# ---
#   bash scripts/build-apk.sh           # genera APK debug (sin firmar)
#   bash scripts/build-apk.sh signed    # genera APK firmado (requiere keystore)
#
# SALIDA
# ------
#   dist/LozkhoStereo-Android-*.apk
# ===========================================================================

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

DIST_DIR="$PROJECT_ROOT/dist"
ANDROID_DIR="$PROJECT_ROOT/android"
OUT_DIR="$PROJECT_ROOT/out"
SIGNED="${1:-}"

mkdir -p "$DIST_DIR"

# ---------------------------------------------------------------------------
# Verificar dependencias
# ---------------------------------------------------------------------------
echo "==> Verificando dependencias..."

command -v node >/dev/null 2>&1 || { echo "ERROR: Node.js no está en PATH."; exit 1; }
command -v java >/dev/null 2>&1 || { echo "ERROR: Java no está en PATH."; exit 1; }

# Bubblewrap (instalar si no existe)
if ! command -v bubblewrap >/dev/null 2>&1; then
  echo "    Bubblewrap no encontrado. Instalando globalmente..."
  npm install -g @bubblewrap/cli
fi

# Android SDK
if [ -z "${ANDROID_HOME:-}" ] && [ -z "${ANDROID_SDK_ROOT:-}" ]; then
  echo "ADVERTENCIA: ANDROID_HOME no está configurado."
  echo "             Bubblewrap puede descargar el SDK automáticamente,"
  echo "             pero requiere aceptar licencias. Si falla, instala:"
  echo "             - Android Studio (recomendado), o"
  echo "             - commandlinetools: https://developer.android.com/studio#command-line-tools-only"
fi

# ---------------------------------------------------------------------------
# 1. Static export
# ---------------------------------------------------------------------------
echo "==> Compilando static export..."
rm -rf "$PROJECT_ROOT/.next" "$OUT_DIR"
bun run build

if [ ! -d "$OUT_DIR" ]; then
  echo "ERROR: ./out no se generó. Revisa next.config.ts."
  exit 1
fi

# ---------------------------------------------------------------------------
# 2. Servir localmente (Bubblewrap necesita un manifest accesible por URL)
# ---------------------------------------------------------------------------
echo "==> Iniciando servidor local de ./out en :3000..."
PORT=3000
npx --yes serve "$OUT_DIR" -l "tcp://0.0.0.0:$PORT" >/tmp/lozkho-serve.log 2>&1 &
SERVE_PID=$!
echo "    PID: $SERVE_PID (logs: /tmp/lozkho-serve.log)"

# Esperar a que arranque
for i in {1..15}; do
  if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/manifest.webmanifest" | grep -q 200; then
    echo "    Servidor listo."
    break
  fi
  sleep 1
done

cleanup() {
  echo "==> Deteniendo servidor local (PID $SERVE_PID)..."
  kill "$SERVE_PID" 2>/dev/null || true
  wait "$SERVE_PID" 2>/dev/null || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# 3. Inicializar Bubblewrap en android/ (si no existe proyecto Android)
# ---------------------------------------------------------------------------
MANIFEST_URL="http://localhost:$PORT/manifest.webmanifest"

if [ ! -f "$ANDROID_DIR/gradle-wrapper.jar" ]; then
  echo "==> Inicializando proyecto Bubblewrap en android/..."
  mkdir -p "$ANDROID_DIR"
  cd "$ANDROID_DIR"
  bubblewrap init --manifest="$MANIFEST_URL" --directory="." || {
    echo "ERROR: bubblewrap init falló. Revisa el manifest en $MANIFEST_URL"
    exit 1
  }
  cd "$PROJECT_ROOT"
else
  echo "==> Proyecto Bubblewrap ya existe en android/. Actualizando..."
  cd "$ANDROID_DIR"
  bubblewrap update --manifest="$MANIFEST_URL" || true
  cd "$PROJECT_ROOT"
fi

# ---------------------------------------------------------------------------
# 4. Build del APK
# ---------------------------------------------------------------------------
echo "==> Construyendo APK..."
cd "$ANDROID_DIR"

if [ "$SIGNED" = "signed" ]; then
  if [ -z "${KEYSTORE_PATH:-}" ] || [ -z "${KEYSTORE_PASSWORD:-}" ] || [ -z "${KEY_ALIAS:-}" ] || [ -z "${KEY_PASSWORD:-}" ]; then
    echo "ERROR: Para APK firmado, define las variables de entorno:"
    echo "  KEYSTORE_PATH, KEYSTORE_PASSWORD, KEY_ALIAS, KEY_PASSWORD"
    echo "  (en GitHub Actions, usa secretos del mismo nombre)"
    exit 1
  fi
  bubblewrap build --type=signed \
    --keystorePath="$KEYSTORE_PATH" \
    --keystorePassword="$KEYSTORE_PASSWORD" \
    --keyAlias="$KEY_ALIAS" \
    --keyPassword="$KEY_PASSWORD"
  APK=$(find . -name "app-release-signed.apk" | head -1)
  OUT_NAME="LozkhoStereo-Android-signed.apk"
else
  # APK debug (sin firma de publicación)
  bubblewrap build --type=unsigned || bubblewrap build
  APK=$(find . -name "app-release-unsigned.apk" -o -name "app-release.apk" | head -1)
  OUT_NAME="LozkhoStereo-Android-debug.apk"
fi

if [ -z "$APK" ] || [ ! -f "$APK" ]; then
  echo "ERROR: No se generó ningún APK. Revisa la salida de bubblewrap."
  exit 1
fi

# ---------------------------------------------------------------------------
# 5. Copiar a dist/ con nombre final
# ---------------------------------------------------------------------------
cp "$APK" "$DIST_DIR/$OUT_NAME"
cd "$PROJECT_ROOT"

echo ""
echo "OK — APK generado:"
echo "    $DIST_DIR/$OUT_NAME"
echo "    Tamaño: $(du -h "$DIST_DIR/$OUT_NAME" | cut -f1)"
echo ""
echo "NOTA: Este es un APK DEBUG (sin firma de publicación)."
echo "Para publicar en Play Store genera uno firmado con:"
echo "  KEYSTORE_PATH=... KEYSTORE_PASSWORD=... KEY_ALIAS=... KEY_PASSWORD=... \\"
echo "  bash scripts/build-apk.sh signed"
