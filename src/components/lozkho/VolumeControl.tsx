"use client";

import { useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

/**
 * Control de volumen de la app.
 *
 * En Android (MainActivity.AndroidVolume) mueve el volumen del stream
 * STREAM_MUSIC — que es lo que escuchará el equipo de audio del auto —.
 * Las teclas físicas NO lo cambian: están reservadas para cambiar de emisora
 * al mantenerlas pulsadas.
 *
 * En web/PWA de escritorio aplica el valor al elemento <audio> mediante
 * window.__lozkhoSetVolume (AudioPlayer).
 */
export function VolumeControl({ compact = true }: { compact?: boolean }) {
  // Inicialización lazy (sin efecto): leemos el volumen real de Android
  // durante el primer render para no disparar la regla
  // react-hooks/set-state-in-effect.
  const [level, setLevel] = useState<number>(() => {
    if (typeof window === "undefined") return 0.6;
    const bridge = (window as any).AndroidVolume;
    if (bridge && typeof bridge.getVolume === "function") {
      try {
        const v = Number(bridge.getVolume());
        if (isFinite(v) && v >= 0 && v <= 1) return v;
      } catch {
        /* ignore */
      }
    }
    return 0.6;
  });

  const apply = (v: number) => {
    setLevel(v);
    const bridge = (window as any).AndroidVolume;
    if (bridge && typeof bridge.setVolume === "function") {
      try {
        bridge.setVolume(v);
      } catch {
        /* ignore */
      }
    }
    const webSetter = (window as any).__lozkhoSetVolume;
    if (typeof webSetter === "function") webSetter(v);
  };

  return (
    <div
      className={
        compact
          ? "flex items-center gap-1.5"
          : "flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
      }
      aria-label="Volumen"
    >
      <button
        type="button"
        onClick={() => apply(level > 0 ? 0 : 0.6)}
        aria-label={level === 0 ? "Activar volumen" : "Silenciar"}
        className="text-white/70 hover:text-white transition shrink-0"
      >
        {level === 0 ? (
          <VolumeX size={compact ? 15 : 18} />
        ) : (
          <Volume2 size={compact ? 15 : 18} />
        )}
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={level}
        onChange={(e) => apply(Number(e.target.value))}
        aria-label="Nivel de volumen"
        className="accent-[var(--station-accent,#F59E0B)] h-4 cursor-pointer"
        style={{ width: compact ? 64 : "100%" }}
      />
    </div>
  );
}
