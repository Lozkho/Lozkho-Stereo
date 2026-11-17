package com.lozkho.stereo;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.IBinder;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import androidx.core.app.NotificationCompat;

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
    private String stationName = "Lozkho Stereo";
    private String stationInfo = "100.0 FM";
    private String trackTitle = "—";
    private int accentColor = 0xFFF59E0B;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        initMediaSession();
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
                @Override
                public void onSkipToNext() {
                    MainActivity.postStationChange(true);
                }

                @Override
                public void onSkipToPrevious() {
                    MainActivity.postStationChange(false);
                }
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
                    .setActions(PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                            | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                            | PlaybackStateCompat.ACTION_PLAY
                            | PlaybackStateCompat.ACTION_PAUSE)
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
                .setColor(accentColor)
                .addAction(0, "Anterior", buildActionPendingIntent(ACTION_PREV, 1))
                .addAction(0, "Siguiente", buildActionPendingIntent(ACTION_NEXT, 2))
                .setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                        .setMediaSession(mediaSession != null ? mediaSession.getSessionToken() : null)
                        .setShowActionsInCompactView(0, 1));
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

        if (ACTION_PREV.equals(action)) {
            // Botón "Anterior" de la notificación (fuera de la Activity).
            MainActivity.postStationChange(false);
        } else if (ACTION_NEXT.equals(action)) {
            MainActivity.postStationChange(true);
        } else if (ACTION_STOP.equals(action)) {
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
