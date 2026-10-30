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
 *   1. La app llama a updateAllWidgets() (vía JavascriptInterface)
 *   2. El sistema llama a onUpdate() (cada 30 minutos por defecto)
 *
 * Los datos se leen de SharedPreferences, que son escritos por
 * MainActivity.StationInterface cuando el JS detecta un cambio de emisora.
 */
public class StationWidgetProvider extends AppWidgetProvider {

    private static final String PREFS_NAME = "lozkho_station_widget";
    private static final String KEY_NAME = "station_name";
    private static final String KEY_FREQUENCY = "station_frequency";
    private static final String KEY_BAND = "station_band";
    private static final String KEY_TRACK = "station_track";
    private static final String KEY_ACCENT = "station_accent";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
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

        // Tap en el widget abre la app
        Intent intent = new Intent(context, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);

        manager.updateAppWidget(widgetId, views);
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
