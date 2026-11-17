package com.lozkho.stereo;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.widget.RemoteViews;

/**
 * Widget del home screen que muestra la emisora activa.
 *
 * Se actualiza cuando:
 *   1. La app llama a saveAndUpdate() (vía JavascriptInterface)
 *   2. El sistema llama a onUpdate() (cada 30 minutos por defecto)
 *
 * Los datos se leen de SharedPreferences, que son escritos por
 * MainActivity.StationInterface cuando el JS detecta un cambio de emisora.
 *
 * Botones ◀/▶: cambian de emisora directamente inyectando JS en el WebView
 * (si la app está viva, MainActivity.postStationChange); si la app fue
 * matada, abren la app (que restaurará el estado desde localStorage).
 */
public class StationWidgetProvider extends AppWidgetProvider {

    private static final String PREFS_NAME = "lozkho_station_widget";
    private static final String KEY_NAME = "station_name";
    private static final String KEY_FREQUENCY = "station_frequency";
    private static final String KEY_BAND = "station_band";
    private static final String KEY_TRACK = "station_track";
    private static final String KEY_ACCENT = "station_accent";

    public static final String ACTION_PREV_STATION = "com.lozkho.stereo.action.widget.PREV_STATION";
    public static final String ACTION_NEXT_STATION = "com.lozkho.stereo.action.widget.NEXT_STATION";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_PREV_STATION.equals(action) || ACTION_NEXT_STATION.equals(action)) {
            boolean next = ACTION_NEXT_STATION.equals(action);
            if (MainActivity.isRunning()) {
                // La app está viva: cambiar de emisora inyectando el mismo JS
                // que usan las teclas de volumen y la notificación de medios.
                MainActivity.postStationChange(next);
            } else {
                // App matada: abrir la app (restaura el estado persistido).
                Intent open = new Intent(context, MainActivity.class);
                open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    context.startActivity(open);
                } catch (Exception ignored) {
                }
            }
            return;
        }
        super.onReceive(context, intent);
    }

    /**
     * Actualiza un widget individual con los datos de SharedPreferences.
     */
    private static void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String name = prefs.getString(KEY_NAME, "Lozkho Stereo");
        String frequency = prefs.getString(KEY_FREQUENCY, "100.0");
        String band = prefs.getString(KEY_BAND, "FM");
        String track = prefs.getString(KEY_TRACK, "—");
        String accentStr = prefs.getString(KEY_ACCENT, "#F59E0B");

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_station);

        views.setTextViewText(R.id.widget_frequency, frequency);
        views.setTextViewText(R.id.widget_band, band);
        views.setTextViewText(R.id.widget_station_name, name);
        views.setTextViewText(R.id.widget_track_title, track);

        // Color de acento para la frecuencia
        try {
            int accentColor = Color.parseColor(accentStr);
            views.setTextColor(R.id.widget_frequency, accentColor);
        } catch (Exception e) {
            views.setTextColor(R.id.widget_frequency, Color.parseColor("#F59E0B"));
        }

        // Tap en el cuerpo del widget abre la app
        Intent openIntent = new Intent(context, MainActivity.class);
        PendingIntent openPi = PendingIntent.getActivity(
                context, 0, openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, openPi);

        // Botones ◀ (emisora anterior) / ▶ (emisora siguiente)
        views.setOnClickPendingIntent(R.id.widget_prev,
                broadcastPendingIntent(context, ACTION_PREV_STATION));
        views.setOnClickPendingIntent(R.id.widget_next,
                broadcastPendingIntent(context, ACTION_NEXT_STATION));

        manager.updateAppWidget(widgetId, views);
    }

    /** PendingIntent de broadcast hacia este propio receiver. */
    private static PendingIntent broadcastPendingIntent(Context context, String action) {
        Intent intent = new Intent(context, StationWidgetProvider.class);
        intent.setAction(action);
        return PendingIntent.getBroadcast(
                context, action.hashCode(), intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /**
     * Guarda los datos de la emisora en SharedPreferences y actualiza
     * todos los widgets instalados. Llamado desde MainActivity.
     */
    static void saveAndUpdate(Context context, String name, String frequency,
                              String band, String track, String accentColor) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
                .putString(KEY_NAME, name)
                .putString(KEY_FREQUENCY, frequency)
                .putString(KEY_BAND, band)
                .putString(KEY_TRACK, track)
                .putString(KEY_ACCENT, accentColor)
                .apply();

        updateAllWidgets(context);
    }

    /**
     * Actualiza todos los widgets instalados en el dispositivo.
     */
    static void updateAllWidgets(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(
                new ComponentName(context, StationWidgetProvider.class));
        for (int id : ids) {
            updateWidget(context, manager, id);
        }
    }
}
