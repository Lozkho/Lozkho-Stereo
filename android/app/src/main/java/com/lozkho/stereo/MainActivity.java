package com.lozkho.stereo;

import android.app.Activity;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.Window;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.ValueCallback;
import android.webkit.JavascriptInterface;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.documentfile.provider.DocumentFile;
import java.io.InputStream;
import java.io.ByteArrayInputStream;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;

/**
 * Activity principal de Lozkho Stereo.
 *
 * Arquitectura de reproducción:
 *  - El WebView aloja la PWA (assets) con TODO el reloj virtual y el
 *    elemento <audio> que decodifica la emisora activa.
 *  - PlaybackService (foreground service mediaPlayback) mantiene el proceso
 *    vivo mientras suena la emisora y expone la notificación de medios
 *    (MediaStyle) + MediaSession en la pantalla de bloqueo.
 *  - MainActivity mantiene una instancia estática (instance) para que el
 *    servicio y el widget puedan inyectar JS en el WebView (cambio de
 *    emisora) mientras la Activity está viva.
 *
 * Importación de directorios (Android SAF):
 *  - Java NO lee el contenido de los archivos: envía solo metadatos
 *    (nombre, ruta relativa, tamaño, MIME) + el content:// URI. El JS
 *    construye URLs https://lozkho.local/<base64(uri)> que el
 *    shouldInterceptRequest resuelve con streaming + soporte de Range.
 *    Antes cada MP3 viajaba entero como data-URL base64 por
 *    evaluateJavascript → importaciones de minutos y audio duplicado.
 */
public class MainActivity extends Activity {

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private static final int FILE_CHOOSER_REQUEST = 1;
    private static final int DIRECTORY_PICK_REQUEST = 2;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 100;
    private boolean directoryMode = false;
    private String directoryFilter = "";

    // Instancia estática para que PlaybackService / StationWidgetProvider
    // puedan pedir el cambio de emisora (inyección JS) mientras la Activity
    // está viva aunque esté en segundo plano (stopped).
    private static volatile MainActivity instance;

    // ---------------------------------------------------------------------------
    // Botones físicos de volumen → cambio de emisora
    //
    // Política (patrón tipo reproductores de música, p. ej. Musicolet):
    //   - Pulsación CORTA: NO se consume → el sistema ajusta el volumen
    //     del medio con normalidad.
    //   - MANTENCIÓN (~0.4 s, cuando el sistema empieza a repetir el
    //     KeyEvent): se cambia de emisora y se consumen los eventos hasta
    //     ACTION_UP para no disparar el cambio más de una vez.
    //
    // Android NO permite interceptar estas teclas con la pantalla bloqueada
    // o la app en background (ver DecisionsView D7): para eso están las
    // acciones prev/siguiente de la notificación de medios y los botones
    // del widget.
    // ---------------------------------------------------------------------------
    private static final int LONG_PRESS_REPEAT_THRESHOLD = 8; // ~400ms (repeats ~50ms)
    private boolean volumeLongConsumedUp = false;
    private boolean volumeLongConsumedDown = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        instance = this;
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        webView = new WebView(this);
        setContentView(webView);

        // Mantener pantalla encendida mientras la app está VISIBLE, para que
        // el reloj virtual avance de forma fluida. (La reproducción con
        // pantalla apagada / app en background la mantiene el WebView junto
        // al PlaybackService.)
        getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setUseWideViewPort(false);
        settings.setLoadWithOverviewMode(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        // Forzar escala de texto al 100%. Se había probado respetar la
        // escala del sistema por accesibilidad, pero en WebView hace que
        // etiquetas/diálogos crezcan y desborden el dock de pestañas en
        // algunos dispositivos. La UI ya usa clamps fluidos (tailwind).
        settings.setTextZoom(100);

        // El meta viewport (width=device-width) lo emite Next.js desde el HTML
        // de la PWA; el WebView lo respeta con UseWideViewPort/LoadWithOverviewMode
        // desactivados (configurado arriba).

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                try {
                    Uri url = request.getUrl();
                    String requestHost = url.getHost();
                    String requestPath = url.getPath();

                    // Handler para URLs "https://lozkho.local/<base64>" —
                    // streaming de archivos SAF (audio importado) con
                    // soporte de Range para el seek del <audio>.
                    if ("lozkho.local".equals(requestHost) && requestPath != null && requestPath.length() > 1) {
                        String encodedUri = requestPath.substring(1);
                        if (encodedUri.isEmpty()) {
                            return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream("".getBytes()));
                        }
                        try {
                            byte[] decoded = android.util.Base64.decode(encodedUri, android.util.Base64.URL_SAFE | android.util.Base64.NO_WRAP);
                            String contentUriStr = new String(decoded, "UTF-8");
                            Uri contentUri = Uri.parse(contentUriStr);
                            InputStream is = getContentResolver().openInputStream(contentUri);
                            if (is == null) return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream("".getBytes()));
                            String mimeType = guessMimeType(contentUriStr);
                            long fileSize = -1;
                            try {
                                android.database.Cursor cursor = getContentResolver().query(contentUri, new String[]{android.provider.OpenableColumns.SIZE}, null, null, null);
                                if (cursor != null) { if (cursor.moveToFirst() && !cursor.isNull(0)) fileSize = cursor.getLong(0); cursor.close(); }
                            } catch (Exception ignored) {}
                            Map<String, String> headers = new HashMap<>();
                            headers.put("Accept-Ranges", "bytes");
                            if (fileSize > 0) headers.put("Content-Length", String.valueOf(fileSize));
                            headers.put("Access-Control-Allow-Origin", "*");
                            String rangeHeader = null;
                            try { Map<String, String> reqHeaders = request.getRequestHeaders(); if (reqHeaders != null) { rangeHeader = reqHeaders.get("Range"); if (rangeHeader == null) rangeHeader = reqHeaders.get("range"); } } catch (Exception ignored) {}
                            if (rangeHeader != null && rangeHeader.startsWith("bytes=") && fileSize > 0) {
                                String range = rangeHeader.substring("bytes=".length()); String[] parts = range.split("-");
                                long start = 0, end = fileSize - 1;
                                try { if (parts.length > 0 && !parts[0].isEmpty()) start = Long.parseLong(parts[0]); if (parts.length > 1 && !parts[1].isEmpty()) end = Long.parseLong(parts[1]); } catch (NumberFormatException ignored) {}
                                if (start < 0 || start >= fileSize || end >= fileSize || start > end) return new WebResourceResponse("text/plain", "utf-8", 416, "Range Not Satisfiable", headers, new ByteArrayInputStream("".getBytes()));
                                long skipped = 0; while (skipped < start) { long s = is.skip(start - skipped); if (s <= 0) break; skipped += s; }
                                headers.put("Content-Length", String.valueOf(end - start + 1));
                                headers.put("Content-Range", "bytes " + start + "-" + end + "/" + fileSize);
                                return new WebResourceResponse(mimeType, null, 206, "Partial Content", headers, is);
                            }
                            return new WebResourceResponse(mimeType, null, 200, "OK", headers, is);
                        } catch (Exception e) {
                            android.util.Log.e("LozkhoFile", "Error streaming " + encodedUri, e);
                            return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream("".getBytes()));
                        }
                    }

                    // Servir assets de la PWA (out/) desde el APK.
                    String path = requestPath;
                    if (requestHost != null && !requestHost.isEmpty()) return null;
                    if (path == null || path.isEmpty()) path = "index.html";

                    String assetPath = path;
                    while (assetPath.startsWith("/")) {
                        assetPath = assetPath.substring(1);
                    }
                    if (assetPath.isEmpty()) {
                        assetPath = "index.html";
                    }
                    if (assetPath.startsWith("./")) {
                        assetPath = assetPath.substring(2);
                    }
                    if (assetPath.endsWith("/")) {
                        assetPath = assetPath + "index.html";
                    }
                    if (assetPath.startsWith("android_asset/")) {
                        assetPath = assetPath.substring("android_asset/".length());
                    }

                    InputStream is = getAssets().open(assetPath);
                    String mimeType = guessMimeType(assetPath);
                    return new WebResourceResponse(mimeType, "utf-8", is);
                } catch (Exception e) {
                    return new WebResourceResponse("text/plain", "utf-8",
                        new ByteArrayInputStream("".getBytes()));
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onConsoleMessage(String message, int lineNumber, String sourceID) {
                android.util.Log.d("LozkhoJS", message + " (" + sourceID + ":" + lineNumber + ")");
            }

            @Override
            public boolean onShowFileChooser(WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }

                // Modo directorio: NO usar el <input> del WebView. En su lugar,
                // abrir ACTION_OPEN_DOCUMENT_TREE directamente, sin pasar por
                // onShowFileChooser. El JS llama a AndroidFilePicker.pickDirectory()
                // que lanza el intent directamente.
                //
                // Si llegamos aquí con directoryMode=true, significa que el JS
                // intentó click en el <input>. Cancelamos el callback para que
                // no se quede colgado.
                if (directoryMode) {
                    directoryMode = false;
                    filePathCallback.onReceiveValue(null);
                    return true; // Consumir para que no abra el selector normal
                }

                MainActivity.this.filePathCallback = filePathCallback;

                // Modo archivos: selector normal
                android.content.Intent intent = fileChooserParams.createIntent();
                intent.putExtra(android.content.Intent.EXTRA_ALLOW_MULTIPLE, true);

                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (Exception e) {
                    filePathCallback.onReceiveValue(null);
                    MainActivity.this.filePathCallback = null;
                    return false;
                }
                return true;
            }
        });

        // JavascriptInterface para que el JS envíe info de la emisora activa
        // (widget + PlaybackService + notificación de medios).
        webView.addJavascriptInterface(new StationInterface(this), "AndroidStation");
        // JavascriptInterface para que el JS indique modo directorio antes
        // de pulsar el <input type=file>
        webView.addJavascriptInterface(new FilePickerInterface(), "AndroidFilePicker");

        webView.loadUrl("file:///android_asset/index.html");

        // Permiso de notificaciones (Android 13+): la notificación de medios
        // del PlaybackService no se muestra sin él.
        requestNotificationPermission();
    }

    /** Si la Activity (y su WebView) están vivas. */
    public static boolean isRunning() {
        return instance != null;
    }

    /**
     * Cambia de emisora inyectando JS en el WebView (lo usan el servicio de
     * reproducción, el widget y las teclas de volumen). Se puede llamar desde
     * cualquier hilo: internamente pasa al hilo de UI.
     */
    public static void postStationChange(boolean next) {
        final MainActivity activity = instance;
        if (activity == null) return;
        activity.runOnUiThread(() -> activity.changeStation(next));
    }

    /**
     * Avanza/retrocede la PISTA de la emisora activa (lo usan la notificación
     * de medios, los botones de headset/Bluetooth y MediaSession). Se inyecta
     * el mismo JS que los controles de la app.
     */
    public static void postTrackChange(boolean next) {
        final MainActivity activity = instance;
        if (activity == null) return;
        final String js = next
            ? "window.__lozkhoNextTrack && window.__lozkhoNextTrack()"
            : "window.__lozkhoPrevTrack && window.__lozkhoPrevTrack()";
        activity.runOnUiThread(() -> {
            if (activity.webView != null) {
                activity.webView.evaluateJavascript(js, null);
            }
        });
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS)
                    != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this,
                    new String[]{android.Manifest.permission.POST_NOTIFICATIONS},
                    NOTIFICATION_PERMISSION_REQUEST);
            }
        }
    }

    private void changeStation(boolean next) {
        String js = next
            ? "window.__lozkhoVolumeUp && window.__lozkhoVolumeUp()"
            : "window.__lozkhoVolumeDown && window.__lozkhoVolumeDown()";
        if (webView != null) {
            webView.evaluateJavascript(js, null);
        }
    }

    /**
     * JavascriptInterface que el código JS llama cuando cambia la emisora
     * o la pista actual. Delega en el widget (SharedPreferences) y en el
     * PlaybackService (notificación de medios + MediaSession).
     *
     * Uso desde JS:
     *   window.AndroidStation.updateStation(JSON.stringify({
     *     name: "Lozkho FM",
     *     frequency: "101.5",
     *     band: "FM",
     *     trackTitle: "Síntesis Nocturna",
     *     accentColor: "#F59E0B"
     *   }));
     */
    private class StationInterface {
        private final MainActivity activity;

        StationInterface(MainActivity activity) {
            this.activity = activity;
        }

        @JavascriptInterface
        public void updateStation(String jsonStr) {
            try {
                JSONObject json = new JSONObject(jsonStr);
                String name = json.optString("name", "Lozkho Stereo");
                String frequency = json.optString("frequency", "100.0");
                String band = json.optString("band", "FM");
                String trackTitle = json.optString("trackTitle", "—");
                String accentColor = json.optString("accentColor", "#F59E0B");

                // Actualizar widget del home screen
                StationWidgetProvider.saveAndUpdate(
                        activity, name, frequency, band, trackTitle, accentColor);

                // Arrancar/actualizar el servicio de reproducción en primer
                // plano (notificación de medios + MediaSession) que mantiene
                // el proceso vivo en background. startForegroundService es
                // seguro desde un hilo de fondo mientras la app está en
                // primer plano; el servicio maneja los errores internamente.
                PlaybackService.startOrUpdate(
                        activity, name, frequency, band, trackTitle, accentColor);
            } catch (Exception e) {
                android.util.Log.e("LozkhoStation", "Error parsing station JSON", e);
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, android.content.Intent data) {
        // --- Directorio (ACTION_OPEN_DOCUMENT_TREE) ---
        // No usa filePathCallback. En su lugar, Java lista los archivos y
        // envía SOLO METADATOS (nombre, ruta, tamaño, MIME, content:// URI)
        // al JS vía evaluateJavascript con window.__lozkhoDirectoryFile.
        // El audio se consume por streaming vía lozkho.local; los archivos
        // pequeños de texto (M3U8/JSON/LRC) los descarga el JS con fetch()
        // solo cuando los necesita parsear.
        if (requestCode == DIRECTORY_PICK_REQUEST) {
            if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) {
                // Usuario canceló
                if (webView != null) {
                    webView.evaluateJavascript(
                        "window.__lozkhoDirectoryResult && window.__lozkhoDirectoryResult([])",
                        null);
                }
                return;
            }

            final Uri treeUri = data.getData();
            try {
                getContentResolver().takePersistableUriPermission(treeUri,
                        android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (Exception e) {
                // No crítico
            }

            // Listar archivos en hilo background, enviando uno a uno
            new Thread(() -> {
                int[] counter = {0};
                try {
                    DocumentFile root = DocumentFile.fromTreeUri(MainActivity.this, treeUri);
                    collectFilesAsMetadata(root, "", counter);
                } catch (Exception e) {
                    android.util.Log.e("LozkhoDir", "Error listando archivos", e);
                }

                // Notificar al JS que terminamos
                final int total = counter[0];
                runOnUiThread(() -> {
                    if (webView != null) {
                        webView.evaluateJavascript(
                            "window.__lozkhoDirectoryDone && window.__lozkhoDirectoryDone(" + total + ")",
                            null);
                    }
                });
            }).start();
            return;
        }

        // --- Archivos sueltos (selector normal) ---
        if (requestCode != FILE_CHOOSER_REQUEST) {
            super.onActivityResult(requestCode, resultCode, data);
            return;
        }

        if (filePathCallback == null) {
            super.onActivityResult(requestCode, resultCode, data);
            return;
        }

        Uri[] results = null;

        if (resultCode == Activity.RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                results = new Uri[count];
                for (int i = 0; i < count; i++) {
                    results[i] = data.getClipData().getItemAt(i).getUri();
                }
            } else if (data.getData() != null) {
                results = new Uri[]{data.getData()};
            }
        }

        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
    }

    // ---------------------------------------------------------------------------
    // Botones de volumen: pulsación corta → volumen del sistema (NO se
    // consume); mantención → cambio de emisora (se consume hasta ACTION_UP).
    // ---------------------------------------------------------------------------
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int keyCode = event.getKeyCode();
        if (keyCode != KeyEvent.KEYCODE_VOLUME_UP
                && keyCode != KeyEvent.KEYCODE_VOLUME_DOWN) {
            return super.dispatchKeyEvent(event);
        }

        final boolean isUp = keyCode == KeyEvent.KEYCODE_VOLUME_UP;
        boolean longConsumed = isUp ? volumeLongConsumedUp : volumeLongConsumedDown;

        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            // El sistema repite el KeyEvent (~50ms) mientras se mantiene la
            // tecla. A partir del umbral, se considera "mantención" → cambiar
            // de emisora una sola vez y consumir los siguientes repeats.
            if (event.getRepeatCount() >= LONG_PRESS_REPEAT_THRESHOLD && !longConsumed) {
                if (isUp) volumeLongConsumedUp = true; else volumeLongConsumedDown = true;
                changeStation(isUp);
                return true;
            }
            if (longConsumed) {
                // Ya se cambió de emisora en esta mantención: consumir el resto
                return true;
            }
            // Pulsación corta: NO consumir → el sistema ajusta el volumen.
            return super.dispatchKeyEvent(event);
        } else { // ACTION_UP
            if (longConsumed) {
                // Cerrar la mantención y consumir el UP para no ajustar el
                // volumen tras el cambio de emisora.
                if (isUp) volumeLongConsumedUp = false; else volumeLongConsumedDown = false;
                return true;
            }
            // Soltado antes del umbral: comportamiento normal del sistema.
            return super.dispatchKeyEvent(event);
        }
    }

    private String guessMimeType(String path) {
        if (path == null) return "application/octet-stream";
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".gif")) return "image/gif";
        if (p.endsWith(".bmp")) return "image/bmp";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".ico")) return "image/x-icon";
        if (p.endsWith(".webmanifest")) return "application/manifest+json";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".txt")) return "text/plain";
        if (p.endsWith(".bat")) return "text/plain";
        if (p.endsWith(".map")) return "application/json";
        if (p.endsWith(".m3u8") || p.endsWith(".m3u")) return "audio/x-mpegurl";
        if (p.endsWith(".lrc")) return "text/plain";
        if (p.endsWith(".mp3")) return "audio/mpeg";
        if (p.endsWith(".m4a")) return "audio/mp4";
        if (p.endsWith(".aac")) return "audio/aac";
        if (p.endsWith(".flac")) return "audio/flac";
        if (p.endsWith(".ogg")) return "audio/ogg";
        if (p.endsWith(".opus")) return "audio/ogg";
        if (p.endsWith(".wav")) return "audio/wav";
        if (p.endsWith(".wma")) return "audio/x-ms-wma";
        if (p.endsWith(".zip")) return "application/zip";
        return "application/octet-stream";
    }

    @Override
    public void onBackPressed() {
        // App de música: el botón atrás NO termina la app (mataría el WebView
        // y con él la reproducción). Con historial en el WebView vuelve atrás;
        // si no hay historial, pasa la app a segundo plano manteniendo la
        // reproducción viva gracias al PlaybackService.
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            moveTaskToBack(true);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        // NO pausar el WebView — queremos que el audio y el reloj virtual
        // sigan funcionando en segundo plano mientras el proceso esté vivo
        // (lo mantiene el PlaybackService). El propio WebView NO se pausa
        // (no se llama a webView.onPause() ni pauseTimers()).
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Tras apagar/encender la pantalla o volver de otra app, el WebView
        // puede haber pausado el audio: pedimos al reproductor que lo reanude.
        if (webView != null) {
            webView.evaluateJavascript(
                "window.__lozkhoResumeAudio && window.__lozkhoResumeAudio()", null);
        }
    }

    @Override
    protected void onDestroy() {
        // Si la Activity se destruye (p. ej. el usuario deslizó la app fuera
        // de recientes), el WebView y su audio mueren con ella: detener el
        // servicio también para no dejar una notificación que no suena.
        try {
            stopService(new android.content.Intent(this, PlaybackService.class));
        } catch (Exception ignored) {
        }
        instance = null;
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    /**
     * Recorre recursivamente un DocumentFile (directorio SAF) y envía al JS,
     * uno a uno, SOLO los METADATOS de cada archivo (nombre, ruta relativa,
     * tamaño, MIME type y content:// URI). El contenido NO se lee aquí:
     *
     *  - Audio: el JS lo reproduce por streaming vía
     *    https://lozkho.local/<base64(contentUri)> (shouldInterceptRequest
     *    con soporte de Range). Antes cada MP3 iba completo como data-URL
     *    base64 (~1.33x su tamaño) por evaluateJavascript → importaciones
     *    de minutos y audio duplicado en IndexedDB.
     *  - Archivos pequeños (M3U8/JSON/LRC/miniaturas): el JS los descarga
     *    con fetch() de esa misma URL solo cuando los necesita.
     *
     * Solo incluye archivos de audio/playlists/letras/imágenes (ver
     * matchesFilter). Límite de seguridad: MAX_FILES.
     *
     * @param dir Directorio raíz DocumentFile
     * @param prefix Path relativo acumulado (ej. "subfolder")
     * @param counter Contador de archivos enviados (array de 1 elemento)
     */
    private int collectFilesAsMetadata(DocumentFile dir, String prefix, int[] counter) {
        if (dir == null) return counter[0];

        final int MAX_FILES = 3000;

        for (DocumentFile file : dir.listFiles()) {
            if (counter[0] >= MAX_FILES) {
                android.util.Log.w("LozkhoDir", "Límite de " + MAX_FILES + " archivos alcanzado");
                break;
            }
            if (file.isDirectory()) {
                String newPrefix = prefix.isEmpty() ? file.getName() : prefix + "/" + file.getName();
                counter[0] = collectFilesAsMetadata(file, newPrefix, counter);
            } else if (file.isFile()) {
                String name = file.getName();
                if (name == null) continue;

                String lower = name.toLowerCase();
                if (!matchesFilter(lower)) continue;

                long fileSize = file.length();
                String uri = file.getUri().toString();
                String mimeType = guessMimeType(name);

                String relativePath = prefix.isEmpty() ? name : prefix + "/" + name;

                String js = "window.__lozkhoDirectoryFile && window.__lozkhoDirectoryFile({" +
                    "\"name\":" + jsonEscape(name) + "," +
                    "\"relativePath\":" + jsonEscape(relativePath) + "," +
                    "\"size\":" + fileSize + "," +
                    "\"type\":" + jsonEscape(mimeType) + "," +
                    "\"contentUri\":" + jsonEscape(uri) +
                    "})";

                final String jsFinal = js;
                runOnUiThread(() -> {
                    if (webView != null) {
                        webView.evaluateJavascript(jsFinal, null);
                    }
                });

                counter[0]++;
            }
        }
        return counter[0];
    }

    /** Escapa un string para incrustarlo como valor JSON en un String JS. */
    private String jsonEscape(String s) {
        if (s == null) return "null";
        StringBuilder sb = new StringBuilder(s.length() + 8);
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '\\': sb.append("\\\\"); break;
                case '"': sb.append("\\\""); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        sb.append('"');
        return sb.toString();
    }

    private boolean matchesFilter(String filename) {
        if (directoryFilter == null || directoryFilter.isEmpty()) {
            // Sin filtro: aceptar todos los formatos conocidos (audio +
            // sidecars + imágenes para thumbnails)
            return filename.endsWith(".mp3") || filename.endsWith(".m4a") ||
                   filename.endsWith(".aac") || filename.endsWith(".flac") ||
                   filename.endsWith(".ogg") || filename.endsWith(".opus") ||
                   filename.endsWith(".wav") || filename.endsWith(".wma") ||
                   filename.endsWith(".m3u8") || filename.endsWith(".m3u") ||
                   filename.endsWith(".json") || filename.endsWith(".lrc") ||
                   filename.endsWith(".txt") || filename.endsWith(".zip") ||
                   filename.endsWith(".png") || filename.endsWith(".jpg") ||
                   filename.endsWith(".jpeg") || filename.endsWith(".webp") ||
                   filename.endsWith(".gif") || filename.endsWith(".bmp") ||
                   filename.endsWith(".svg");
        }
        // Con filtro: comprobar cada extensión. Importante: el filtro
        // viene de JS (aceptado por el usuario en ImportExportDialog) y
        // ahora incluye extensiones de audio + imagen para que SAF sí
        // devuelva los MP3 y los thumbnails al importar emisoras.
        String[] exts = directoryFilter.toLowerCase().split(",");
        for (String ext : exts) {
            ext = ext.trim();
            if (!ext.startsWith(".")) ext = "." + ext;
            if (filename.endsWith(ext)) return true;
        }
        return false;
    }

    /**
     * JavascriptInterface para importar directorios en Android.
     *
     * El flujo es:
     *   1. JS llama a window.AndroidFilePicker.pickDirectory([filtro])
     *   2. Java lanza ACTION_OPEN_DOCUMENT_TREE (selector de carpeta SAF)
     *   3. Usuario elige carpeta (Java pide permiso persistente READ)
     *   4. Java lista todos los archivos recursivamente con DocumentFile
     *   5. Para cada archivo, Java envía metadatos + content:// URI al JS
     *      vía evaluateJavascript (callback window.__lozkhoDirectoryFile)
     *
     * El JS recibe objetos {name, relativePath, size, type, contentUri} y
     * construye URLs reproducibles https://lozkho.local/<base64(contentUri)>.
     */
    private class FilePickerInterface {
        @JavascriptInterface
        public void pickDirectory() {
            pickDirectory("");
        }

        @JavascriptInterface
        public void pickDirectory(String filter) {
            directoryFilter = filter != null ? filter : "";
            runOnUiThread(() -> {
                android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_OPEN_DOCUMENT_TREE);
                intent.addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION
                        | android.content.Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                try {
                    startActivityForResult(intent, DIRECTORY_PICK_REQUEST);
                } catch (Exception e) {
                    android.util.Log.e("LozkhoDir", "Error lanzando SAF", e);
                    if (webView != null) {
                        webView.evaluateJavascript(
                            "window.__lozkhoDirectoryDone && window.__lozkhoDirectoryDone(0)",
                            null);
                    }
                }
            });
        }
    }
}
