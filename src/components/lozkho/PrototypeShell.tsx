"use client";

import { useEffect } from "react";
import { useLozkho } from "@/lozkho/store";
import { audioStore } from "@/lozkho/audioStore";
import { StationScreen } from "./StationScreen";
import { SettingsPanel } from "./SettingsPanel";
import { StationsListView } from "./views/StationsListView";
import { LyricsManagerView } from "./views/LyricsManagerView";
import { AudioPlayer } from "./AudioPlayer";
import { Radio, ListMusic, FileText } from "lucide-react";

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
  // Frecuencia: 1 segundo (no 500ms) para reducir la carga y evitar
  // conflictos con el AudioPlayer que se sincroniza via onTimeUpdate.
  // El reloj virtual solo avanza la posición; el audio real se maneja
  // por separado en AudioPlayer.tsx
  useEffect(() => {
    const interval = window.setInterval(() => {
      tickClock(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [tickClock]);

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
  // Esto hace que el audio importado vuelva a sonar tras cerrar y reabrir.
  useEffect(() => {
    const restore = async () => {
      try {
        const result = await audioStore.restoreAllUrls(
          () => {
            const s = useLozkho.getState();
            return { stations: s.stations };
          },
          (patch: any) => useLozkho.setState(patch)
        );
        if (result.restored > 0) {
          console.info(
            `AudioStore: ${result.restored} archivo(s) restaurado(s) de IndexedDB`
          );
        }
      } catch (err) {
        console.warn("AudioStore: error al restaurar archivos:", err);
      }
    };
    // Pequeño delay para que zustand/persist hidrate primero
    const timer = setTimeout(restore, 500);
    return () => clearTimeout(timer);
  }, []);

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
    </div>
  );
}
