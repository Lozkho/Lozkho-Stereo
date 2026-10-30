"use client";

import { useEffect } from "react";
import { useLozkho, buildExtendedPlaylist } from "@/lozkho/store";
import { audioStore } from "@/lozkho/audioStore";
import { lozkhoLog } from "@/lozkho/logger";
import { formatFrequency } from "@/lozkho/format";
import { StationScreen } from "./StationScreen";
import { SettingsPanel } from "./SettingsPanel";
import { StationsListView } from "./views/StationsListView";
import { LyricsManagerView } from "./views/LyricsManagerView";
import { AudioPlayer } from "./AudioPlayer";
import { DebugLogButton } from "./DebugLogButton";
import { Radio, ListMusic, FileText } from "lucide-react";
import { toast } from "sonner";

const NAV = [
  { id: "emisora", label: "Emisora", icon: Radio },
  { id: "emisoras", label: "Emisoras", icon: ListMusic },
  { id: "letras", label: "Letras", icon: FileText },
] as const;

export function PrototypeShell() {
  const view = useLozkho((s) => s.view);
  const setView = useLozkho((s) => s.setView);
  const settingsOpen = useLozkho((s) => s.settingsOpen);
  const openSettings = useLozkho((s) => s.openSettings);
  const tickClock = useLozkho((s) => s.tickClock);

  // Ticker global que avanza el reloj virtual de TODAS las emisoras.
  // Frecuencia: 500ms para mejor sincronización con el audio real.
  useEffect(() => {
    const interval = window.setInterval(() => {
      tickClock(Date.now());
    }, 500);
    return () => window.clearInterval(interval);
  }, [tickClock]);

  // Enviar info de la emisora activa al widget y notificación de Android.
  // Se ejecuta cuando cambia la emisora activa, la pista actual, o el tick
  // (para mantener el widget actualizado con la pista en reproducción).
  const activeStationId = useLozkho((s) => s.activeStationId);
  const stations = useLozkho((s) => s.stations);
  const tick = useLozkho((s) => s.tick);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const androidStation = (window as any).AndroidStation;
    if (!androidStation) return;

    const station = stations.find((s) => s.id === activeStationId);
    if (!station) return;

    // Calcular la pista actual
    const extended = buildExtendedPlaylist(station);
    const current = extended[station.playback.currentItemIndex % extended.length];
    let trackTitle = "—";
    if (current?.kind === "track") {
      const track = station.playlist.find((t) => t.id === current.ref.id);
      trackTitle = track?.title ?? "—";
    } else if (current?.kind === "ad") {
      trackTitle = "PUBLICIDAD";
    }

    const data = {
      name: station.name,
      frequency: formatFrequency(station.frequency, station.band),
      band: station.band,
      trackTitle,
      accentColor: station.colors.accent,
    };

    try {
      androidStation.updateStation(JSON.stringify(data));
    } catch (err) {
      // Silencioso: la interfaz podría no estar lista
    }
  }, [activeStationId, stations, tick]);

  // Registro del Service Worker para que la app funcione sin conexión.
  // Solo en navegadores compatibles y fuera de localhost (dev).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (
      window.location.protocol === "http:" &&
      window.location.hostname === "localhost"
    )
      return;
    const onLoad = () => {
      navigator.serviceWorker
        .register("./sw.js")
        .catch((err) => console.warn("SW no registrado:", err));
    };
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  // Restaurar blob: URLs desde IndexedDB al cargar la app.
  // CRÍTICO: hacerlo lo antes posible para que el AudioPlayer encuentre
  // sourceUri válidos en cuanto se monte. Antes había un setTimeout de
  // 500ms que causaba que el primer track cargara sin audio.
  useEffect(() => {
    let cancelled = false;
    let retries = 0;
    const restore = async () => {
      try {
        // Esperar a que Zustand haya hidratado desde localStorage.
        // Si restoreAllUrls se ejecuta antes de la hidratación, verá
        // stations=[] y no hará nada.
        const state = useLozkho.getState();
        if (!state.stations || state.stations.length === 0) {
          // Reintentar hasta 30 veces (3s total) esperando la hidratación
          if (retries++ < 30) {
            setTimeout(restore, 100);
            return;
          }
          lozkhoLog.warn("Restore: no hay emisoras tras 3s esperando hidratación");
          return;
        }
        lozkhoLog.info(
          `Restore: iniciando con ${state.stations.length} emisora(s)`,
          state.stations.map((s) => ({
            id: s.id,
            name: s.name,
            tracks: s.playlist?.length ?? 0,
            thumb: s.thumbnailUri ? "yes" : "no",
          }))
        );
        const result = await audioStore.restoreAllUrls(
          () => {
            const s = useLozkho.getState();
            return { stations: s.stations };
          },
          (patch: any) => useLozkho.setState(patch)
        );
        if (cancelled) return;
        lozkhoLog.info(
          `Restore OK: ${result.restored} blobs restaurados, ${result.failed} fallidos`
        );
      } catch (err) {
        lozkhoLog.error("Restore falló", err);
      }
    };
    // Ejecutar inmediatamente, sin setTimeout artificial
    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  // Registrar funciones globales para cambio de emisora con teclas de volumen
  // Android (MainActivity.java) las invoca vía evaluateJavascript cuando el
  // usuario SOSTIENE la tecla de volumen (long-press). Las pulsaciones cortas
  // cambian el volumen del sistema normalmente y no llegan aquí.
  //
  // También se invocan en PC si el usuario tiene mapeado un atajo global
  // (configurable en el futuro; por ahora no hay teclado de volumen en PC).
  useEffect(() => {
    const stations = useLozkho.getState().stations;
    if (stations.length === 0) return;

    (window as any).__lozkhoVolumeUp = () => {
      const s = useLozkho.getState();
      if (s.stations.length === 0) return;
      const idx = s.stations.findIndex((st) => st.id === s.activeStationId);
      const nextIdx = idx < s.stations.length - 1 ? idx + 1 : 0;
      const next = s.stations[nextIdx];
      s.setActiveStation(next.id);
      toast.success("Emisora siguiente", {
        description: next.name,
        duration: 1500,
      });
    };

    (window as any).__lozkhoVolumeDown = () => {
      const s = useLozkho.getState();
      if (s.stations.length === 0) return;
      const idx = s.stations.findIndex((st) => st.id === s.activeStationId);
      const prevIdx = idx > 0 ? idx - 1 : s.stations.length - 1;
      const prev = s.stations[prevIdx];
      s.setActiveStation(prev.id);
      toast.success("Emisora anterior", {
        description: prev.name,
        duration: 1500,
      });
    };

    return () => {
      delete (window as any).__lozkhoVolumeUp;
      delete (window as any).__lozkhoVolumeDown;
    };
  }, [useLozkho.getState().stations.length]);

  return (
    <div className="min-h-[100dvh] bg-black text-white flex flex-col">
      <main className="flex-1">
        {view === "emisora" && (
          <StationScreen onOpenSettings={() => openSettings(true)} />
        )}
        {view === "emisoras" && <StationsListView />}
        {view === "letras" && <LyricsManagerView />}
      </main>

      {/* Reproductor de audio real — reproduce la emisora activa en bucle.
          Las emisoras no activas solo avanzan su reloj virtual. */}
      <AudioPlayer />

      {/* Navegación inferior tipo app móvil */}
      <nav className="fixed bottom-0 inset-x-0 z-20 bg-black/95 backdrop-blur border-t border-white/10 pb-[calc(env(safe-area-inset-bottom)+0.25rem)]">
        <div className="mx-auto max-w-2xl grid grid-cols-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className="flex flex-col items-center justify-center gap-0.5 py-2.5 transition"
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
              >
                <Icon
                  size={20}
                  className={active ? "text-white" : "text-white/45"}
                />
                <span
                  className={
                    active
                      ? "text-[10px] font-semibold text-white"
                      : "text-[10px] text-white/45"
                  }
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <SettingsPanel
        open={settingsOpen}
        onOpenChange={(o) => openSettings(o)}
      />

      {/* Botón flotante de logs de diagnóstico */}
      <DebugLogButton />
    </div>
  );
}
