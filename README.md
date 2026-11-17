# Lozkho Stereo

Aplicación de reproducción musical que simula una emisora de radio y funciona principalmente sin conexión. El usuario crea emisoras, les asigna playlists y anuncios, y cada emisora avanza en bucle infinito. Solo una emisora es audible a la vez; las demás avanzan virtualmente en segundo plano. Incluye letras sincronizadas (modo karaoke), importación/exportación de emisoras (M3U8 + JSON + ZIP) y letras (LRC).

**Versión actual: 0.2.2**

---

## Stack técnico (real, verificado)

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16 (App Router, `output: "export"`) + React 19 + TypeScript 5 |
| Estilos | Tailwind CSS 4 + componentes shadcn/ui usados por la app |
| Estado | Zustand 5 + `persist` → `localStorage` (emisoras, posición, letras) |
| Archivos de audio/imagen | IndexedDB (`src/lozkho/audioStore.ts`) en PC; **streaming SAF** en Android |
| Audio | Elemento `<audio>` del WebView, sincronizado con el "reloj virtual" de las emisoras |
| Android | Proyecto Gradle propio (`android/`): `MainActivity` + WebView + **`PlaybackService`** (foreground service mediaPlayback) + widget + MediaSession |
| Windows | Tauri 2 (`src-tauri/`), instalador NSIS |
| Web | PWA con Service Worker (`public/sw.js`) |

> El archivo `android/twa-manifest.json` de versiones anteriores se eliminó: el APK **no** es un TWA de Bubblewrap, se compila con Gradle directamente.

---

## Requisitos

### Desarrollo local
- **Bun** ≥ 1.3.14 (recomendado) o Node.js ≥ 18 + npm
- Git, navegador moderno (Chrome/Edge/Firefox)

### Generación del APK
- GitHub Actions lo hace automáticamente (no necesitas Android SDK): ver § *Compilación*.
- Opcional en local: Java JDK 17+, Android SDK (platform 34 + build-tools 34.0.0).

---

## Desarrollo local

```bash
git clone https://github.com/Lozkho/Lozkho-Stereo.git
cd Lozkho-Stereo
bun install --frozen-lockfile
bun run dev          # http://localhost:3000
bun run lint         # ESLint (debe dar 0 errores)
bun test             # 11 pruebas unitarias (bun:test)
bun run build        # genera ./out (export estático)
bun run start        # sirve ./out en :3000
```

Si `next build` se detiene mostrando un aviso de actualización de Next.js, vuelve a ejecutar el comando o usa `CI=true bun run build` (en GitHub Actions `CI=true` ya está activo, por lo que allí no ocurre).

El Service Worker solo se registra fuera de `localhost` para no interferir con el hot reload.

---

## Compilación

### Export estático (PWA)
```bash
bun run build        # → ./out/
```

### Windows (Tauri, instalador NSIS)
El workflow `Build All` (job `build-windows`, `windows-latest`) genera:
- `LozkhoStereo-Windows-portable.zip` (contenido de `out/`)
- `LozkhoStereo-Windows-installer.exe` (Tauri NSIS)

Local: `bun run build && cd src-tauri && cargo tauri build --bundles nsis`.

### Android APK

**Recomendado: GitHub Actions.** Haz push a `main` o lanza manualmente el workflow:

```
Actions → Build All → (job Android APK) → artefacto
  LozkhoStereo-Android-debug-apk  →  dist/LozkhoStereo-Android-debug.apk
```

El workflow:
1. Compila la web (`bun run build`) y verifica `out/index.html` y `out/_next/`.
2. Copia `out/` a `android/app/src/main/assets/` (con `aaptOptions.ignoreAssetsPattern` para que AAPT2 no excluya `_next/`).
3. Ejecuta `./gradlew assembleDebug` (wrapper versionado en el repo).
4. Verifica que el APK contenga `assets/_next/` e imprime su certificado con `apksigner`.
5. Sube el APK como artefacto (30 días). En tags `v*` lo adjunta al release.

**Local (opcional):**
```bash
bun run build
rm -rf android/app/src/main/assets && mkdir -p android/app/src/main/assets
cp -a out/. android/app/src/main/assets/
cd android && ./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

**Firma debug fija**: `android/debug.keystore` está versionado (alias `androiddebugkey`, contraseñas `android`). Todos los builds —locales y de CI— firman con la misma clave, así que puedes instalar una versión nueva **sobre** la anterior (`adb install -r`) sin perder emisoras, miniaturas ni letras. Es una clave **de depuración**, no apta para Play Store.

Para publicación, configurar los secretos `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` y añadir un `signingConfigs.release` en `android/app/build.gradle`.

---

## GitHub Actions

Un único workflow: **`.github/workflows/build-all.yml`** (push a `main`, tags `v*`, `workflow_dispatch`).

| Job | Runner | Salida |
|---|---|---|
| `ci` (Lint + Build) | ubuntu-latest | Verificación ESLint + `bun test` + artefacto `lozkho-static-export` |
| `build-windows` | windows-latest | ZIP portable + instalador NSIS |
| `build-android` | ubuntu-latest | APK debug firmado + verificación de firma |

Para publicar un release: `git tag v0.2.2 && git push origin v0.2.2` → los artefactos se adjuntan automáticamente.

---

## Estructura principal

```
.github/workflows/build-all.yml  # CI + builds (web, Windows, Android)
android/                         # Proyecto Gradle + WebView (NO Bubblewrap)
  app/src/main/java/com/lozkho/stereo/
    MainActivity.java            # WebView, SAF, volumen long-press, puente JS
    PlaybackService.java         # foreground service + MediaSession + notificación media
    StationWidgetProvider.java   # widget con botones ◀/▶
  app/src/main/AndroidManifest.xml
  app/build.gradle               # keystore debug fijo, ver 0.2.2 (code 5)
  debug.keystore                 # firma debug estable (versionada a propósito)
src/app/                         # layout, página, estilos globales
src/components/lozkho/           # UI de la app (StationScreen, KaraokeView, AudioPlayer…)
src/lozkho/                      # lógica: store, audioStore, stationImport, thumbnail, nowPlaying…
src-tauri/                       # backend Rust mínimo para Windows
tests/unit/                      # pruebas unitarias (bun test)
public/                          # sw.js, manifiesto, iconos
```

---

## Limitaciones y decisiones

- **Reproducción en background**: el `PlaybackService` mantiene el proceso vivo mientras suena la emisora. Si deslizas la app fuera de "recientes", la Activity se destruye y la reproducción se detiene (el WebView es el motor de audio). Para una reproducción nativa independiente haría falta mover el audio a ExoPlayer dentro del servicio.
- **Botones físicos de volumen**: pulsación corta = volumen normal del sistema; mantención (~0.4 s) = cambiar de emisora. Android **no permite** interceptarlos con la pantalla bloqueada o la app en background: para eso están las acciones de la notificación de medios, el widget y D7 en `DecisionsView`.
- **Persistencia del punto de reproducción**: se guarda posición e índice; al reabrir, el reloj virtual avanza por el tiempo transcurrido **capado a una vuelta de ciclo**, de modo que la emisora continúa desde donde estaba sin dar cientos de saltos.
- **Miniaturas**: se reescalan a 512 px y se guardan en IndexedDB; nunca como data-URL en localStorage.
- **Importación en Android**: los archivos de audio **no se copian** a la app; se reproducen por streaming desde el `content://` que elegiste (permiso persistente SAF). El audio se guarda en IndexedDB solo en PC/web.
- **Fuentes**: se cargan desde Google Fonts; sin conexión se usan fallbacks del sistema tras la primera visita.
- **Sin tests de dispositivo automatizados** en CI: reproducción con pantalla apagada, SAF, widget, volumen y adaptación real requieren unAndroid físico.

---

## Licencia

MIT — ver [`LICENSE`](./LICENSE). Los recursos que importes conservan sus licencias originales.
