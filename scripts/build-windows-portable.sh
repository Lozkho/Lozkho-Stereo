#!/usr/bin/env bash
# ===========================================================================
# Lozkho Stereo — Construcción de la versión portable para Windows 10
# ===========================================================================
# Genera un ZIP portable con:
#   - El static export de Next.js (HTML/CSS/JS/iconos/manifest/SW)
#   - Un lanzador `LozkhoStereo.bat` que abre la app en el navegador por defecto
#   - Un `README-PORTABLE.txt` con instrucciones de uso
#
# Requisitos:
#   - Bun >= 1.3 (o Node >= 18 + npm/pnpm)
#   - `zip` instalado (en Windows usar Git Bash o WSL)
#
# Uso:
#   bash scripts/build-windows-portable.sh
#
# Salida:
#   dist/LozkhoStereo-Windows-portable.zip
# ===========================================================================

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_ROOT"

DIST_DIR="$PROJECT_ROOT/dist"
WORK_DIR="$DIST_DIR/_lozkho-portable"
OUTPUT_ZIP="$DIST_DIR/LozkhoStereo-Windows-portable.zip"
APP_NAME="LozkhoStereo"

echo "==> Limpiando build anterior..."
rm -rf "$WORK_DIR" "$OUTPUT_ZIP"
mkdir -p "$DIST_DIR"

echo "==> Compilando static export (next build)..."
rm -rf "$PROJECT_ROOT/.next" "$PROJECT_ROOT/out"
bun run build

if [ ! -d "$PROJECT_ROOT/out" ]; then
  echo "ERROR: No se generó ./out después del build. Revisa next.config.ts."
  exit 1
fi

echo "==> Copiando archivos al directorio de trabajo..."
mkdir -p "$WORK_DIR/$APP_NAME"
cp -r "$PROJECT_ROOT/out/." "$WORK_DIR/$APP_NAME/"

# Lanzador .bat para Windows
cat > "$WORK_DIR/$APP_NAME/$APP_NAME.bat" << 'BAT'
@echo off
REM Lanzador de Lozkho Stereo (versión portable).
REM Abre index.html en el navegador por defecto del sistema.
start "" "%~dp0index.html"
BAT

# README portable
cat > "$WORK_DIR/$APP_NAME/README-PORTABLE.txt" << 'TXT'
LOZKHO STEREO — VERSIÓN PORTABLE PARA WINDOWS 10
================================================

USO
---
1. Descomprime este ZIP en cualquier carpeta (escritorio, USB, etc.).
2. Haz doble clic en `LozkhoStereo.bat` (o abre `index.html` directamente
   en tu navegador preferido).
3. La app se abrirá en una pestaña del navegador por defecto.
4. Para instalarla como app (PWA): en Chrome/Edge, menú → Instalar Lozkho Stereo.

SIN CONEXIÓN
------------
La app incluye un Service Worker. Tras la primera apertura, los archivos
se cachean y la app seguirá funcionando sin internet en las próximas
aperturas.

REQUISITOS
----------
- Windows 10 o superior
- Un navegador moderno (Edge, Chrome, Firefox, Brave)
- ~50 MB de espacio en disco

LICENCIA
--------
MIT. Consulta LICENSE en el repositorio si necesitas atribución.
TXT

echo "==> Empaquetando ZIP portable..."
cd "$WORK_DIR"
zip -r -q "$OUTPUT_ZIP" "$APP_NAME"

echo "==> Limpiando directorio temporal..."
rm -rf "$WORK_DIR"

echo ""
echo "OK — ZIP portable generado:"
echo "    $OUTPUT_ZIP"
echo "    Tamaño: $(du -h "$OUTPUT_ZIP" | cut -f1)"
