package com.lozkho.stereo;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
import android.graphics.Color;
import android.os.Build;
import android.os.IBinder;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * Servicio de reproducción en primer plano (foreground, tipo mediaPlayback).
 *
 * RESPONSABILIDAD: mantener el proceso de la app vivo mientras suena la
 * emisora activa, para que Android no congele/mate el WebView (que es el
 * motor de audio y del reloj virtual). Antes no había ningún Service: los
 * permisos FOREGROUND_SERVICE/WAKE_LOCK estaban declarados pero sin uso, y
 * la música se detenía al poco tiempo de poner la app en background.
 *
 * Además expone:
 *  - Notificación de medios (MediaStyle) persistente con acciones
 *    anterior/siguiente → cambio de emisora desde la pantalla de bloqueo,
 *    el shade y wearables.
 *  - MediaSession con PlaybackState/Metadata → integración con el sistema
 *    (lock screen, foco de audio, botones de headset).
 *
 * El cambio de emisora lo delega al WebView vía MainActivity.postStationChange
 * (inyección de window.__lozkhoVolumeUp/Down()), que son las mismas funciones
 * que usan las teclas de volumen y el widget.
 */
public class PlaybackService extends Service {

    public static final String ACTION_START = "com.lozkho.stereo.action.START";
    public static final String ACTION_UPDATE = "com.lozkho.stereo.action.UPDATE";
    public static final String ACTION_PREV = "com.lozkho.stereo.action.PREV";
    public static final String ACTION_NEXT = "com.lozkho.stereo.action.NEXT";
    public static final String ACTION_STOP = "com.lozkho.stereo.action.STOP";

    public static final String CHANNEL_ID = "lozkho_station_channel";
    public static final int NOTIFICATION_ID = 1002;

    public static final String EXTRA_NAME = "name";
    public static final String EXTRA_FREQUENCY = "frequency";
    public static final String EXTRA_BAND = "band";
    public static final String EXTRA_TRACK = "track";
    public static final String EXTRA_ACCENT = "accent";

    private MediaSessionCompat mediaSession;

    // --- Detección de mantención de volumen con pantalla apagada ------------
    // Con el screen off, Android NO entrega KEYCODE_VOLUME a la Activity, pero
    // SÍ emite android.media.VOLUME_CHANGED_ACTION. Ojo: en ese estado el
    // Moto G7 Power ajusta STREAM_RING (vibra), NO STREAM_MUSIC — por eso no
    // se puede filtrar por stream. Un toque aislado produce UN broadcast (se
    // ignora); una mantención produce una ráfaga (~10/s). Al detectar >=3
    // cambios en 800ms, cambiamos de emisora. Con la pantalla encendida este
    // receiver NO dispara: MainActivity consume los KeyEvents y el sistema
    // no emite el broadcast (no hay doble cambio).
    private static final String VOLUME_CHANGED_ACTION = "android.media.VOLUME_CHANGED_ACTION";
    private static final String EXTRA_STREAM_TYPE = "android.media.EXTRA_VOLUME_STREAM_TYPE";
    private static final String EXTRA_STREAM_VALUE = "android.media.EXTRA_VOLUME_STREAM_VALUE";
    private static final int VOLUME_BURST_COUNT = 3;
    private static final long VOLUME_BURST_WINDOW_MS = 800;

    private BroadcastReceiver volumeChangedReceiver;
    private int lastStreamType = -1;
    private int lastVolumeValue = -1;
    private long volumeBurstStart = 0;
    private int volumeBurstCount = 0;
    private boolean volumeHoldTriggered = false;

    private String stationName = "Lozkho Stereo";
    private String stationInfo = "100.0 FM";
    private String trackTitle = "—";
    private int accentColor = 0xFFF59E0B;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        initMediaSession();
        registerVolumeHoldReceiver();
    }

    private void registerVolumeHoldReceiver() {
        try {
            AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                lastVolumeValue = am.getStreamVolume(AudioManager.STREAM_MUSIC);
            }
            volumeChangedReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (intent == null || intent.getAction() == null) return;
                    if (!VOLUME_CHANGED_ACTION.equals(intent.getAction())) return;
                    int stream = intent.getIntExtra(EXTRA_STREAM_TYPE, -1);
                    int value = intent.getIntExtra(EXTRA_STREAM_VALUE, -1);
                    if (value < 0) return;

                    // Aceptar CUALQUIER stream: con pantalla apagada el
                    // dispositivo mueve STREAM_RING, no STREAM_MUSIC.
                    if (stream != lastStreamType) {
                        // Primer evento de otro stream: solo referencia
                        lastStreamType = stream;
                        lastVolumeValue = value;
                        return;
                    }
                    final boolean up = value > lastVolumeValue;
                    if (value == lastVolumeValue) return;
                    lastVolumeValue = value;

                    long now = System.currentTimeMillis();
                    if (now - volumeBurstStart > VOLUME_BURST_WINDOW_MS) {
                        // Nueva ráfaga (o primer evento tras un rato)
                        volumeBurstStart = now;
                        volumeBurstCount = 0;
                        volumeHoldTriggered = false;
                    }
                    volumeBurstCount++;

                    // Un toque corto = 1 evento → NO cambia nada.
                    // Mantener pulsado = varios eventos seguidos → cambiar
                    // de emisora una sola vez por ráfaga.
                    if (!volumeHoldTriggered && volumeBurstCount >= VOLUME_BURST_COUNT) {
                        volumeHoldTriggered = true;
                        android.util.Log.i("LozkhoMedia", "Volumen mantenido (screen off) → cambio de emisora");
                        MainActivity.postStationChange(up);
                    }
                }
            };
            IntentFilter filter = new IntentFilter(VOLUME_CHANGED_ACTION);
            // ContextCompat añade la flag RECEIVER_* que exigen Android 13+
            ContextCompat.registerReceiver(this, volumeChangedReceiver, filter,
                    ContextCompat.RECEIVER_NOT_EXPORTED);
        } catch (Exception e) {
            android.util.Log.w("LozkhoMedia", "No se pudo registrar receiver de volumen", e);
        }
    }

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

    private void initMediaSession() {
        try {
            mediaSession = new MediaSessionCompat(this, "LozkhoStereo");
            mediaSession.setFlags(MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS
                    | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS);
            mediaSession.setCallback(new MediaSessionCompat.Callback() {
                // Sin acciones de salto: la app reproduce la playlist que le
                // corresponde a la emisora. El usuario NO controla qué canción
                // suena desde fuera (notificación / headset / volumen).
            });
            mediaSession.setActive(true);
            android.util.Log.i("LozkhoMedia", "MediaSession activa (PlaybackService)");
        } catch (Exception e) {
            android.util.Log.e("LozkhoMedia", "Error inicializando MediaSession", e);
        }
    }

    private void updatePlaybackState() {
        if (mediaSession == null) return;
        try {
            mediaSession.setPlaybackState(new PlaybackStateCompat.Builder()
                    .setActions(0) // sin controles de transporte para el usuario
                    .setState(PlaybackStateCompat.STATE_PLAYING, 0, 1f)
                    .build());
            mediaSession.setMetadata(new MediaMetadataCompat.Builder()
                    .putString(MediaMetadataCompat.METADATA_KEY_TITLE, trackTitle)
                    .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, stationInfo)
                    .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, stationName)
                    .build());
        } catch (Exception e) {
            android.util.Log.e("LozkhoMedia", "Error actualizando PlaybackState", e);
        }
    }

    private PendingIntent buildActionPendingIntent(String action, int requestCode) {
        Intent intent = new Intent(this, PlaybackService.class);
        intent.setAction(action);
        return PendingIntent.getService(this, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Notification buildNotification() {
        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent contentPi = PendingIntent.getActivity(this, 0, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String contentText = stationInfo + (trackTitle == null || trackTitle.isEmpty()
                ? "" : " · " + trackTitle);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(stationName)
                .setContentText(contentText)
                .setOngoing(true)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(contentPi)
                .setShowWhen(false)
                .setColor(accentColor);
        // Sin addAction(): la notificación solo informa de la emisora en
        // curso; no permite saltar canciones ni emisoras.
        return builder.build();
    }

    private void applyExtras(Intent intent) {
        if (intent == null) return;
        String name = intent.getStringExtra(EXTRA_NAME);
        if (name != null && !name.isEmpty()) stationName = name;
        String frequency = intent.getStringExtra(EXTRA_FREQUENCY);
        String band = intent.getStringExtra(EXTRA_BAND);
        String info = ((frequency != null ? frequency : "") + " " + (band != null ? band : "")).trim();
        if (!info.isEmpty()) stationInfo = info;
        String track = intent.getStringExtra(EXTRA_TRACK);
        if (track != null) trackTitle = track;
        String accent = intent.getStringExtra(EXTRA_ACCENT);
        if (accent != null && !accent.isEmpty()) {
            try {
                accentColor = Color.parseColor(accent);
            } catch (Exception ignored) {
            }
        }
    }

    private void startOrUpdateForeground() {
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            // Android 10+: declarar el tipo del servicio (obligatorio en API 34+)
            startForeground(NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null && intent.getAction() != null
                ? intent.getAction() : ACTION_START;

        // La notificación no tiene acciones: solo se informa del estado.
        // No hay ACTION_PREV/NEXT que permitan saltar pistas desde fuera.
        if (ACTION_STOP.equals(action)) {
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        } else {
            // START / UPDATE: refrescar datos, MediaSession y notificación.
            applyExtras(intent);
            updatePlaybackState();
            try {
                startOrUpdateForeground();
            } catch (Exception e) {
                android.util.Log.e("LozkhoMedia", "startForeground falló", e);
            }
        }
        // NOT_STICKY: si el sistema mata el servicio, la Activity también habrá
        // muerto (mismo proceso); lo relanza la app cuando el usuario vuelva.
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        if (volumeChangedReceiver != null) {
            try {
                unregisterReceiver(volumeChangedReceiver);
            } catch (Exception ignored) {
            }
            volumeChangedReceiver = null;
        }
        if (mediaSession != null) {
            try {
                mediaSession.setActive(false);
                mediaSession.release();
            } catch (Exception ignored) {
            }
            mediaSession = null;
        }
        super.onDestroy();
    }

    /**
     * Arranca/actualiza el servicio con los datos de la emisora activa.
     * Se llama desde StationInterface.updateStation (hilo del WebView) cada
     * vez que cambia la emisora o la pista (el JS ya limita la frecuencia).
     */
    public static void startOrUpdate(Context ctx, String name, String frequency,
                                      String band, String track, String accent) {
        Intent intent = new Intent(ctx, PlaybackService.class);
        intent.setAction(ACTION_START);
        intent.putExtra(EXTRA_NAME, name);
        intent.putExtra(EXTRA_FREQUENCY, frequency);
        intent.putExtra(EXTRA_BAND, band);
        intent.putExtra(EXTRA_TRACK, track);
        intent.putExtra(EXTRA_ACCENT, accent);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent);
            } else {
                ctx.startService(intent);
            }
        } catch (Exception e) {
            // Restricciones de inicio en segundo plano (Android 12+): puede
            // ocurrir si el usuario bloquea la pantalla justo en el momento
            // del cambio de emisora. No es crítico: el servicio seguirá vivo
            // con los datos anteriores y la próxima llamada lo reintentará.
            android.util.Log.w("LozkhoMedia", "No se pudo iniciar/actualizar PlaybackService", e);
        }
    }
}
