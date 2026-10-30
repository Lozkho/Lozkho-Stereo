package com.lozkho.stereo;

import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.media.AudioManager;
import android.media.session.MediaSession;
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
import androidx.core.app.NotificationCompat;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.documentfile.provider.DocumentFile;
import java.io.InputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;

public class MainActivity extends Activity {

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private static final int FILE_CHOOSER_REQUEST = 1;
    private static final int DIRECTORY_PICK_REQUEST = 2;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 100;
    private boolean directoryMode = false;
    private String directoryFilter = "";
    private static final String CHANNEL_ID = "lozkho_station_channel";
    private static final int NOTIFICATION_ID = 1001;
    private MediaSession mediaSession;
    private long lastVolumeChangeTime = 0;
    private static final long VOLUME_DEBOUNCE = 400;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        webView = new WebView(this);
        setContentView(webView);

        // Mantener pantalla encendida
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
        settings.setTextZoom(100);

        // Mantener pantalla encendida para que el reloj virtual siga avanzando
        // y el audio siga reproduciéndose con pantalla bloqueada.
        getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Forzar viewport a ancho de dispositivo móvil para que el CSS
        // responsive funcione correctamente en Android WebView.
        // Sin esto, el WebView usa un ancho de 980px por defecto (viewport
        // de escritorio) y la app se ve "demasiado grande".
        int widthDp = getResources().getConfiguration().screenWidthDp;
        String viewportMeta = "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no\">";
        // El meta tag ya está en el HTML del Next.js, pero el WebView
        // necesita LoadWithOverviewMode + UseWideViewPort desactivados
        // para respetar el viewport=device-width en lugar del suyo propio.

        // Inyectar CSS para asegurar que el body no exceda el ancho
        webView.evaluateJavascript(
            "var style = document.createElement('style');" +
            "style.textContent = 'html,body{max-width:100vw!important;overflow-x:hidden!important;margin:0!important;padding:0!important;}';" +
            "document.head.appendChild(style);",
            null
        );

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                try {
                    Uri url = request.getUrl();
                    String requestHost = url.getHost();
                    String requestPath = url.getPath();

                    // Handler para URLs "https://lozkho.local/<base64>"
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
                Intent intent = fileChooserParams.createIntent();
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);

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
        webView.addJavascriptInterface(new StationInterface(this), "AndroidStation");
        // JavascriptInterface para que el JS indique modo directorio antes
        // de pulsar el <input type=file>
        webView.addJavascriptInterface(new FilePickerInterface(), "AndroidFilePicker");

        webView.loadUrl("file:///android_asset/index.html");

        // Crear canal de notificación (requerido en Android 8+)
        createNotificationChannel();
        requestNotificationPermission();
        initMediaSession();
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

    private void initMediaSession() {
        try {
            mediaSession = new MediaSession(this, "LozkhoStereo");
            mediaSession.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS |
                    MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
            mediaSession.setActive(true);
            android.util.Log.i("LozkhoMedia", "MediaSession inicializada");
        } catch (Exception e) {
            android.util.Log.e("LozkhoMedia", "Error inicializando MediaSession", e);
        }
    }

    private void changeStation(boolean next) {
        String js = next
            ? "window.__lozkhoVolumeUp && window.__lozkhoVolumeUp()"
            : "window.__lozkhoVolumeDown && window.__lozkhoVolumeDown()";
        runOnUiThread(() -> {
            if (webView != null) webView.evaluateJavascript(js, null);
        });
    }

    /**
     * Crea el canal de notificación para mostrar la emisora activa
     * en la pantalla de bloqueo.
     */
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    getString(R.string.notification_channel_name),
                    NotificationManager.IMPORTANCE_LOW);
            channel.setDescription(getString(R.string.notification_channel_desc));
            channel.setShowBadge(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    /**
     * Actualiza la notificación de la pantalla de bloqueo con la info
     * de la emisora activa. La notificación tiene VISIBILITY_PUBLIC para
     * que se muestre incluso con la pantalla bloqueada.
     */
    private void updateLockScreenNotification(String name, String frequency,
                                               String band, String trackTitle,
                                               String accentColor) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        Intent openIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String contentText = frequency + " " + band;
        if (trackTitle != null && !trackTitle.isEmpty()) {
            contentText += " · " + trackTitle;
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(name)
                .setContentText(contentText)
                .setOngoing(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(pendingIntent)
                .setShowWhen(false);

        // Color de acento
        try {
            int color = Color.parseColor(accentColor);
            builder.setColor(color);
        } catch (Exception e) {
            builder.setColor(Color.parseColor("#F59E0B"));
        }

        manager.notify(NOTIFICATION_ID, builder.build());
    }

    /**
     * JavascriptInterface que el código JS llama para actualizar el widget
     * y la notificación de la pantalla de bloqueo cuando cambia la emisora
     * o la pista actual.
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
                String trackTitle = json.optString("trackTitle", "");
                String accentColor = json.optString("accentColor", "#F59E0B");

                // Actualizar widget del home screen
                StationWidgetProvider.saveAndUpdate(
                        activity, name, frequency, band, trackTitle, accentColor);

                // Actualizar notificación de la pantalla de bloqueo
                activity.runOnUiThread(() ->
                        activity.updateLockScreenNotification(
                                name, frequency, band, trackTitle, accentColor));
            } catch (Exception e) {
                android.util.Log.e("LozkhoStation", "Error parsing station JSON", e);
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        // --- Directorio (ACTION_OPEN_DOCUMENT_TREE) ---
        // No usa filePathCallback. En su lugar, lee los archivos y los
        // envía al JS via evaluateJavascript con window.__lozkhoDirectoryResult.
        if (requestCode == DIRECTORY_PICK_REQUEST) {
            if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) {
                // Usuario canceló
                webView.evaluateJavascript(
                    "window.__lozkhoDirectoryResult && window.__lozkhoDirectoryResult([])",
                    null);
                return;
            }

            final Uri treeUri = data.getData();
            try {
                getContentResolver().takePersistableUriPermission(treeUri,
                        Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (Exception e) {
                // No crítico
            }

            // Listar y leer archivos en hilo background, enviando uno a uno
            new Thread(() -> {
                int[] counter = {0};
                try {
                    DocumentFile root = DocumentFile.fromTreeUri(this, treeUri);
                    collectFilesAsJson(root, "", counter);
                } catch (Exception e) {
                    android.util.Log.e("LozkhoDir", "Error listando archivos", e);
                }

                // Notificar al JS que terminamos
                final int total = counter[0];
                runOnUiThread(() -> webView.evaluateJavascript(
                    "window.__lozkhoDirectoryDone && window.__lozkhoDirectoryDone(" + total + ")",
                    null));
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

    // Cambiar emisora al PRESIONAR botón de volumen (no sostener).
    // Consume TODOS los eventos de volumen para que el sistema NO cambie el volumen.
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int action = event.getAction();
        int keyCode = event.getKeyCode();

        if (keyCode != KeyEvent.KEYCODE_VOLUME_UP
                && keyCode != KeyEvent.KEYCODE_VOLUME_DOWN) {
            return super.dispatchKeyEvent(event);
        }

        final boolean isUp = keyCode == KeyEvent.KEYCODE_VOLUME_UP;

        if (action == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) {
            long now = System.currentTimeMillis();
            if (now - lastVolumeChangeTime > VOLUME_DEBOUNCE) {
                lastVolumeChangeTime = now;
                changeStation(isUp);
            }
        }
        // Consumir TODOS los eventos de volumen
        return true;
    }

    private String guessMimeType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".ico")) return "image/x-icon";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".webmanifest")) return "application/manifest+json";
        if (path.endsWith(".woff2")) return "font/woff2";
        if (path.endsWith(".woff")) return "font/woff";
        if (path.endsWith(".txt")) return "text/plain";
        if (path.endsWith(".bat")) return "text/plain";
        if (path.endsWith(".map")) return "application/json";
        return "application/octet-stream";
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        // NO pausar el WebView — queremos que el audio y el reloj virtual
        // sigan funcionando en segundo plano.
        // Solo pausar si el WebView está en una pestaña invisible.
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Re-activar MediaSession al volver a la app
        if (mediaSession != null) {
            try { mediaSession.setActive(true); } catch (Exception e) {}
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    /**
     * Recorre recursivamente un DocumentFile (directorio SAF), lee cada archivo
     * y lo envía INDIVIDUALMENTE al JS via evaluateJavascript.
     *
     * Esto evita el crash por OutOfMemoryError que ocurría cuando se intentaba
     * leer TODOS los archivos a la vez en un solo StringBuilder y pasarlo
     * como un único string gigante a evaluateJavascript().
     *
     * Solo incluye archivos de audio y playlists (mp3, m4a, flac, ogg, wav,
     * m3u8, m3u, json, lrc, txt, zip).
     *
     * @param dir Directorio raíz DocumentFile
     * @param prefix Path relativo acumulado (ej. "subfolder")
     * @param counter Contador de archivos enviados (array de 1 elemento)
     */
    private int collectFilesAsJson(DocumentFile dir, String prefix, int[] counter) {
        if (dir == null) return counter[0];

        // Límites de seguridad aumentados para soportar colecciones grandes.
        // Antes: 30 archivos / 50MB → rompía con cualquier biblioteca real.
        // Ahora: 3000 archivos / 500MB. Los MP3 largos (hasta 30MB) se admiten.
        final int MAX_FILES = 3000;
        final long MAX_TOTAL_SIZE = 500 * 1024 * 1024;
        final long MAX_FILE_SIZE = 30 * 1024 * 1024;
        long totalSize = 0;

        for (DocumentFile file : dir.listFiles()) {
            if (counter[0] >= MAX_FILES) {
                android.util.Log.w("LozkhoDir", "Límite de " + MAX_FILES + " archivos alcanzado");
                break;
            }
            if (file.isDirectory()) {
                String newPrefix = prefix.isEmpty() ? file.getName() : prefix + "/" + file.getName();
                counter[0] = collectFilesAsJson(file, newPrefix, counter);
            } else if (file.isFile()) {
                String name = file.getName();
                if (name == null) continue;

                String lower = name.toLowerCase();
                if (!matchesFilter(lower)) continue;

                long fileSize = file.length();
                if (fileSize > MAX_FILE_SIZE) {
                    android.util.Log.w("LozkhoDir", "Archivo demasiado grande (>30MB), saltando: " + name + " (" + fileSize + " bytes)");
                    continue;
                }
                if (totalSize + fileSize > MAX_TOTAL_SIZE) {
                    android.util.Log.w("LozkhoDir", "Tamaño total máximo (500MB) alcanzado, saltando: " + name);
                    continue;
                }

                try {
                    InputStream is = getContentResolver().openInputStream(file.getUri());
                    if (is == null) continue;

                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    byte[] buffer = new byte[8192];
                    int read;
                    while ((read = is.read(buffer)) != -1) {
                        baos.write(buffer, 0, read);
                    }
                    is.close();

                    byte[] fileBytes = baos.toByteArray();
                    totalSize += fileBytes.length;

                    String base64 = android.util.Base64.encodeToString(fileBytes, android.util.Base64.NO_WRAP);
                    String mimeType = guessMimeType(name);
                    String dataUrl = "data:" + mimeType + ";base64," + base64;

                    fileBytes = null;
                    base64 = null;

                    String relativePath = prefix.isEmpty() ? name : prefix + "/" + name;
                    String escapedName = name.replace("\\", "\\\\").replace("\"", "\\\"");
                    String escapedPath = relativePath.replace("\\", "\\\\").replace("\"", "\\\"");

                    String js = "window.__lozkhoDirectoryFile && window.__lozkhoDirectoryFile({" +
                        "\"name\":\"" + escapedName + "\"," +
                        "\"relativePath\":\"" + escapedPath + "\"," +
                        "\"size\":" + fileSize + "," +
                        "\"type\":\"" + mimeType + "\"," +
                        "\"dataUrl\":\"" + dataUrl + "\"" +
                        "})";

                    dataUrl = null;

                    final String jsFinal = js;
                    runOnUiThread(() -> webView.evaluateJavascript(jsFinal, null));

                    counter[0]++;
                    Thread.sleep(5);

                } catch (Exception e) {
                    android.util.Log.w("LozkhoDir", "Error leyendo " + name, e);
                }
            }
        }
        return counter[0];
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
        String lower = filename.toLowerCase();
        String[] exts = directoryFilter.toLowerCase().split(",");
        for (String ext : exts) {
            ext = ext.trim();
            if (!ext.startsWith(".")) ext = "." + ext;
            if (lower.endsWith(ext)) return true;
        }
        return false;
    }

    /**
     * JavascriptInterface para importar directorios en Android.
     *
     * El flujo es:
     *   1. JS llama a window.AndroidFilePicker.pickDirectory()
     *   2. Java lanza ACTION_OPEN_DOCUMENT_TREE (selector de carpeta SAF)
     *   3. Usuario elige carpeta
     *   4. Java lista todos los archivos recursivamente con DocumentFile
     *   5. Para cada archivo, Java lee su nombre, tamaño, MIME type y
     *      contenido (como data URL base64) y los envía de vuelta al JS
     *      via evaluateJavascript con una función callback.
     *
     * El JS recibe los archivos como objetos {name, size, type, dataUrl}
     * donde dataUrl es "data:audio/mpeg;base64,...."
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
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                        | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                try {
                    startActivityForResult(intent, DIRECTORY_PICK_REQUEST);
                } catch (Exception e) {
                    android.util.Log.e("LozkhoDir", "Error lanzando SAF", e);
                    webView.evaluateJavascript(
                        "window.__lozkhoDirectoryDone && window.__lozkhoDirectoryDone(0)",
                        null);
                }
            });
        }
    }
}
