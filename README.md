# Lozkho Stereo

Aplicación de reproducción musical que simula una estación de radio y funciona principalmente sin conexión a internet. Implementada como **PWA** (Progressive Web App) con Next.js 16, TypeScript, Tailwind 4 y shadcn/ui. Empaquetable como **Windows portable**, **instalador .exe** (Inno Setup) y **APK de Android** (Bubblewrap / Trusted Web Activity).

---

## Tabla de contenidos

1. [Resumen del proyecto](#resumen-del-proyecto)
2. [Requisitos](#requisitos)
3. [Instalación para desarrollo](#instalación-para-desarrollo)
4. [Desarrollo local](#desarrollo-local)
5. [Pruebas](#pruebas)
6. [Compilación](#compilación)
   - [Static export (PWA)](#static-export-pwa)
   - [Windows portable (.zip)](#windows-portable-zip)
   - [Windows instalador (.exe)](#windows-instalador-exe)
   - [Android APK](#android-apk)
7. [Publicar en GitHub](#publicar-en-github)
8. [Automatización con GitHub Actions](#automatización-con-github-actions)
9. [Firma de publicación](#firma-de-publicación)
10. [Estructura del repositorio](#estructura-del-repositorio)
11. [Limitaciones conocidas](#limitaciones-conocidas)
12. [Licencia](#licencia)

---

## Resumen del proyecto

Lozkho Stereo convierte un dispositivo en una emisora de radio personal: el usuario crea emisoras, asigna playlists y anuncios, y cada emisora se reproduce en bucle infinito. Solo una emisora es audible a la vez; las demás avanzan virtualmente en segundo plano. La interfaz prioriza las letras (modo normal y karaoke sincronizado), soporta importación/exportación de emisoras (M3U8 + JSON) y letras (LRC), y permite personalizar paleta, tipografía del título, miniatura y programación de anuncios.

**Stack técnico:**

- **Framework:** Next.js 16.1.3 (App Router) + React 19
- **Lenguaje:** TypeScript 5
- **Estilos:** Tailwind CSS 4 + shadcn/ui (New York style)
- **Estado:** Zustand con `persist` middleware → localStorage (sobrevive recargas)
- **Audio:** HTML5 `<audio>` element con blob URLs para archivos importados
- **Empaquetado PWA:** `next build` con `output: "export"` → HTML/CSS/JS estáticos
- **Empaquetado Android:** Bubblewrap (TWA)
- **Empaquetado Windows nativo:** Tauri 2.x (genera .exe instalable + binario portable)
- **Empaquetado Windows web:** ZIP portable + Inno Setup (alternativa, sin usar)

---

## Requisitos

### Para desarrollo local

- **Bun** ≥ 1.3.14 (recomendado) o Node.js ≥ 18 + npm
- **Git** ≥ 2.30
- Navegador moderno (Chrome, Edge, Firefox)

### Para generar artefactos

| Artefacto | Requisito adicional |
|---|---|
| Static export (PWA) | Bun |
| Windows portable ZIP | Bun + `zip` |
| Windows .exe instalador | [Inno Setup 6](https://jrsoftware.org/isdl.php) + [ImageMagick](https://imagemagick.org/) (en windows-latest de GitHub Actions ya están) |
| Android APK | Node.js + Bubblewrap + Android SDK + Java JDK 17+ |

---

## Instalación para desarrollo

```bash
git clone https://github.com/USER/lozkho-stereo.git
cd lozkho-stereo
bun install
```

> Si usas npm en lugar de bun: `npm install` y luego sustituye `bun` por `npm run` en los comandos.

---

## Desarrollo local

```bash
bun run dev
# → http://localhost:3000
```

El servidor de desarrollo incluye hot reload. La app carga con 3 emisoras demo y todas las funciones de edición activas.

> **Service Worker deshabilitado en dev**: el SW solo se registra fuera de `localhost` para no interferir con el hot reload.

---

## Pruebas

El proyecto usa ESLint como prueba automática principal (no hay tests unitarios de behaviour todavía).

```bash
bun run lint
```

### Pruebas manuales recomendadas

1. **Reproducción simultánea**: verifica que las 3 emisoras avanzan solas (badge "2º plano" en las no activas).
2. **Cambio de emisora**: pulsa otra emisora en el dock inferior; la anterior debe seguir avanzando en segundo plano.
3. **Editor completo**: ve a "Emisoras" → "Editar" → modifica identidad, apariencia, playlist y anuncios. Confirma que los cambios se reflejan en la pantalla principal.
4. **Importación de miniatura**: en "Ajustes → Miniatura", importa una imagen PNG/JPG y verifica que se muestra en la tarjeta de emisora.
5. **Tipografía del título**: cambia entre las 8 fuentes y colores disponibles; el cambio es inmediato.
6. **Búsqueda de letras en línea**: en "Letras", encola 5 búsquedas — solo 3 se ejecutarán simultáneamente.
7. **Sin conexión**: tras la primera carga, desconecta internet y recarga — la app debe seguir funcionando (gracias al SW).

### Pruebas que requieren dispositivo real

- Instalación como app en Android (TWA)
- Instalación como PWA en Windows
- Notificaciones del sistema (no implementadas en este prototipo)
- Controles físicos de volumen con pantalla bloqueada (ver `Decisiones → D7`)

---

## Compilación

### Static export (PWA)

```bash
bun run build
# → ./out/ contiene HTML/CSS/JS estáticos listos para servir
```

Puedes servirlo localmente con:

```bash
bun run start
# → npx serve out -p 3000
```

### Windows portable (.zip)

```bash
bash scripts/build-windows-portable.sh
# → dist/LozkhoStereo-Windows-portable.zip (1.2 MB aprox)
```

El ZIP contiene:

- `LozkhoStereo/index.html` y todos los assets estáticos
- `LozkhoStereo/LozkhoStereo.bat` — lanzador que abre la app en el navegador por defecto
- `LozkhoStereo/README-PORTABLE.txt` — instrucciones para el usuario final

**Para usar el ZIP en Windows:**

1. Descomprime en cualquier carpeta (escritorio, USB, etc.).
2. Doble clic en `LozkhoStereo.bat`.
3. La app se abre en el navegador por defecto.
4. (Opcional) Para instalarla como PWA: en Chrome/Edge, menú → "Instalar Lozkho Stereo".

### Windows instalador (.exe)

El instalador se genera con [Inno Setup 6](https://jrsoftware.org/isdl.php). El script está en `installer/lozkho-stereo.iss`.

**En Windows (con Inno Setup instalado):**

```powershell
# Después de generar ./out con `bun run build`:
# Convertir icon.png a icon.ico (requiere ImageMagick)
magick public\icon-512.png -define icon:auto-resize=256,128,64,48,32,16 public\icon-512.ico

# Compilar instalador
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\lozkho-stereo.iss
# → dist\LozkhoStereo-Windows-installer.exe
```

**En Linux/macOS (cross-compile vía Wine):**

```bash
wine "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer/lozkho-stereo.iss
```

> **Nota**: este entorno Linux no tiene Inno Setup instalado. El workflow `build-windows.yml` lo ejecuta en `windows-latest` de GitHub Actions, donde sí está disponible.

El instalador .exe:

- Copia la PWA a `C:\Program Files\LozkhoStereo\`
- Crea accesos directos en Escritorio y Menú Inicio
- Registra la app en "Agregar o quitar programas"
- Soporta español e inglés
- El desinstalador limpia los archivos

### Android APK

El APK se genera con [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) (Trusted Web Activity de Google), que envuelve la PWA en un APK instalable.

**Flujo completo:**

```bash
bash scripts/build-apk.sh
# → dist/LozkhoStereo-Android-debug.apk
```

Para APK firmado (Play Store):

```bash
KEYSTORE_PATH=/path/to/android.keystore \
KEYSTORE_PASSWORD=... \
KEY_ALIAS=lozkho \
KEY_PASSWORD=... \
bash scripts/build-apk.sh signed
# → dist/LozkhoStereo-Android-signed.apk
```

**Requisitos del entorno local:**

1. **Node.js** ≥ 18 (Bubblewrap requiere Node)
2. **Java JDK** ≥ 17 (Bubblewrap lo usa para Gradle)
3. **Android SDK** con `build-tools` y `platform-tools`
   - Establece `ANDROID_HOME` (ej. `~/.android/sdk`)
   - O instala Android Studio y deja que Bubblewrap lo detecte
4. **Bubblewrap CLI**: `npm install -g @bubblewrap/cli`

**Limitaciones del APK debug:**

- No se puede publicar en Play Store (requiere firma de publicación)
- Muestra un banner de depuración
- Firmado con la clave de debug de Android

**Instalación del APK en un dispositivo:**

```bash
adb install dist/LozkhoStereo-Android-debug.apk
```

O transfiere el `.apk` al dispositivo y ábrelo desde el gestor de archivos (necesitarás activar "Orígenes desconocidos").

---

## Publicar en GitHub

### 1. Crear el repositorio en GitHub

Crea un repo vacío en https://github.com/new (sin README, sin .gitignore, sin LICENSE — los vamos a subir nosotros).

### 2. Configurar el remote y subir

```bash
cd /ruta/a/lozkho-stereo

# Revisa que el .gitignore está aplicado (no debe subir node_modules ni .next)
git status

# Añadir y commitear cambios pendientes
git add .
git commit -m "Configuración PWA + GitHub Actions + empaquetado Windows/Android"

# Conectar al remoto (cambia USER por tu usuario)
git remote add origin https://github.com/USER/lozkho-stereo.git
git branch -M main
git push -u origin main
```

### 3. Verificar que los workflows corren

Ve a la pestaña **Actions** del repositorio. Deben aparecer tres workflows:

- `CI` — lint + build estático en cada push/PR
- `Build Windows` — ZIP portable + instalador .exe (en `windows-latest`)
- `Build Android APK` — APK debug (en `ubuntu-latest`)

Los workflows se disparan automáticamente en cada push a `main`. Para lanzarlos manualmente, ve a Actions → selecciona el workflow → "Run workflow".

### 4. Descargar artefactos

Cada build sube los artefactos a la pestaña "Artifacts" del run. Cualquiera con acceso al repo puede descargarlos durante 30 días.

### 5. Crear un release con tag

```bash
git tag v0.2.1
git push origin v0.2.1
```

Los workflows `Build Windows` y `Build Android APK` detectan el tag `v*` y automáticamente adjuntan los artefactos al release de GitHub.

---

## Automatización con GitHub Actions

Tres workflows definidos en `.github/workflows/`:

| Workflow | Trigger | Plataforma | Salida |
|---|---|---|---|
| `ci.yml` | push/PR a `main` | `ubuntu-latest` | Lint + static export (artifact `lozkho-static-export`) |
| `build-windows.yml` | push a `main`, tags `v*`, manual | `ubuntu-latest` + `windows-latest` | ZIP portable + instalador .exe |
| `build-android.yml` | push a `main`, tags `v*`, manual | `ubuntu-latest` | APK debug (unsigned) |

### Workflows adicionales recomendados (futuro)

- `release.yml` — coordina los tres builds y crea un release unificado
- `codeql.yml` — análisis de seguridad de GitHub
- `dependabot.yml` — actualización automática de dependencias

---

## Firma de publicación

### APK de publicación (Play Store)

El workflow `build-android.yml` incluye un job `build-apk-signed` **comentado** que se activa cuando configures los secretos.

**Pasos para configurar la firma segura en GitHub:**

1. **Genera un keystore** localmente (una sola vez, guárdalo seguro):

   ```bash
   keytool -genkey -v \
     -keystore lozkho.keystore \
     -alias lozkho \
     -keyalg RSA -keysize 2048 -validity 10000 \
     -dname "CN=Lozkho Stereo, O=Lozkho, C=CO"
   ```

   Te pedirá una contraseña para el keystore y otra para la key. **Guárdalas en un gestor de contraseñas.**

2. **Codifica el keystore en base64:**

   ```bash
   base64 -i lozkho.keystore > keystore.base64
   ```

3. **Configura los secretos** en GitHub → Settings → Secrets and variables → Actions:

   | Secret | Valor |
   |---|---|
   | `KEYSTORE_BASE64` | Contenido de `keystore.base64` |
   | `KEYSTORE_PASSWORD` | Contraseña del keystore |
   | `KEY_ALIAS` | `lozkho` (o el alias que elegiste) |
   | `KEY_PASSWORD` | Contraseña de la key |

4. **Descomenta el job `build-apk-signed`** en `.github/workflows/build-android.yml`.

5. **Crea un tag** para disparar el build firmado:

   ```bash
   git tag v0.2.1
   git push origin v0.2.1
   ```

El APK firmado se adjuntará automáticamente al release de GitHub.

### Instalador Windows con firma de código (opcional)

Para evitar el aviso "Editor desconocido" en Windows, puedes firmar el `.exe` con un certificado de código:

1. Compra un certificado de Authenticode (DigiCert, Sectigo, etc.)
2. Configura los secretos en GitHub:

   | Secret | Valor |
   |---|---|
   | `WINDOWS_CERT_PFX_BASE64` | Certificado PFX codificado en base64 |
   | `WINDOWS_CERT_PASSWORD` | Contraseña del PFX |

3. Añade un paso en `build-windows.yml` para firmar con `signtool.exe`.

> Sin firma, Windows muestra "Editor desconocido" al instalar. La app funciona igual, pero el usuario debe hacer clic en "Más información → Ejecutar de todas formas".

---

## Estructura del repositorio

```
lozkho-stereo/
├── .github/workflows/        # CI + builds automatizados
│   ├── ci.yml
│   ├── build-windows.yml
│   └── build-android.yml
├── android/                  # Configuración Bubblewrap (TWA)
│   └── twa-manifest.json
├── installer/                # Inno Setup para instalador .exe
│   └── lozkho-stereo.iss
├── public/                   # Assets estáticos servidos por Next
│   ├── icon-192.png          # Icono PWA
│   ├── icon-512.png          # Icono PWA + Windows
│   ├── manifest.webmanifest # Manifest PWA
│   ├── sw.js                 # Service Worker (offline)
│   ├── LozkhoStereo.bat      # Lanzador Windows portable
│   ├── logo.svg
│   └── robots.txt
├── scripts/                  # Scripts de build local
│   ├── build-windows-portable.sh
│   ├── build-apk.sh
│   └── make_icons.py
├── src/
│   ├── app/                  # App Router de Next.js
│   │   ├── layout.tsx       # Metadata PWA + fuentes
│   │   ├── page.tsx         # Punto de entrada (renderiza PrototypeShell)
│   │   └── globals.css      # Estilos globales + tema oscuro
│   ├── components/
│   │   ├── lozkho/          # Componentes específicos de Lozkho
│   │   │   ├── PrototypeShell.tsx     # Shell con navegación inferior
│   │   │   ├── StationScreen.tsx      # Pantalla "Now Playing"
│   │   │   ├── StationEditor.tsx      # Editor completo (CRUD)
│   │   │   ├── SettingsPanel.tsx      # Panel lateral de ajustes rápidos
│   │   │   ├── LyricsPanel.tsx        # Vista de letras + karaoke
│   │   │   ├── AdBanner.tsx
│   │   │   ├── CycleEstimate.tsx
│   │   │   ├── ImportExportDialog.tsx # Diálogo reutilizable
│   │   │   └── views/
│   │   │       ├── StationsListView.tsx
│   │   │       ├── LyricsManagerView.tsx
│   │   │       ├── DesignDocView.tsx
│   │   │       └── DecisionsView.tsx
│   │   └── ui/               # shadcn/ui components
│   └── lozkho/               # Lógica de dominio
│       ├── types.ts          # Tipos de datos
│       ├── store.ts          # Zustand store con CRUD de emisoras
│       ├── demo-data.ts      # 3 emisoras de ejemplo
│       ├── fonts.ts          # Catálogo de 8 tipografías
│       ├── format.ts         # Utilidades de formato
│       └── useFileImport.tsx # Hook simulado de importación
├── prisma/schema.prisma      # Schema SQLite (no usado en prototipo)
├── next.config.ts            # output: export + assetPrefix: ./
├── package.json
├── tsconfig.json
├── eslint.config.mjs
├── tailwind.config.ts
├── .gitignore
├── .env.example
├── LICENSE                   # MIT
└── README.md                 # Este archivo
```

---

## Limitaciones conocidas

### Generales del prototipo

1. **Sin audio real**: el reloj virtual avanza con `setInterval(500ms)` simulando reproducción. No se decodifica audio. Esto es intencional en la fase de diseño.
2. **Sin persistencia**: el estado está en Zustand en memoria. Al recargar se pierden los cambios. La implementación nativa debe usar SQLite.
3. **Sin importación real de archivos**: los diálogos de importación simulan la acción con toasts; no leen ni copian archivos.

### Empaquetado

1. **APK debug (no Play Store)**: el workflow genera APK sin firma de publicación. Para Play Store, configura los secretos descritos en [Firma de publicación](#firma-de-publicación).
2. **Instalador Windows sin firma de código**: el `.exe` muestra "Editor desconocido". Funciona, pero requiere que el usuario haga clic en "Ejecutar de todas formas".
3. **El APK requiere conexión a internet la primera vez**: Bubblewrap valida el manifest en build time. Tras la instalación, la PWA funciona offline gracias al SW.
4. **No hay notificaciones nativas**: el prototipo no implementa `MediaSession` ni notificaciones de pantalla bloqueada. Esto requiere código nativo (no es posible desde una PWA pura).

### Incompatibilidades con el stack

| Función | ¿Soportada en PWA? | Alternativa nativa necesaria |
|---|---|---|
| Selector de archivos SAF (Android) | ⚠️ Limitado (solo File API web) | Flutter o Capacitor |
| Notificación MediaSession | ✅ Web Media Session API | — |
| Teclas físicas de volumen | ❌ No interceptable | Sin alternativa fiable |
| Reproducción en segundo plano real | ✅ SW + MediaSession | — |
| Acceso a rutas absolutas (Windows) | ❌ Solo File API web | Electron o Tauri |

---

## Licencia

MIT — ver [`LICENSE`](./LICENSE).

Los recursos de audio, letras e imágenes que el usuario importe conservan sus licencias originales. Las emisoras demo usan material CC0 / CC-BY con su atribución.
