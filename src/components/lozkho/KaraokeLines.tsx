"use client";

import { useEffect, useMemo, useRef } from "react";
import type { StationLyrics } from "@/lozkho/types";
import { cx, hexToRgba } from "@/lozkho/format";

interface KaraokeLinesProps {
  lyrics: StationLyrics;
  /** Posición de la pista en ms (reloj virtual de la emisora). */
  positionMs: number;
  /** Color de acento de la emisora. */
  accent: string;
  /**
   * "panel" — versión compacta dentro de LyricsPanel (max 40vh).
   * "full"  — versión grande para la pestaña Karaoke.
   */
  variant?: "panel" | "full";
}

/**
 * Lista de líneas de letra sincronizadas estilo karaoke: resalta la línea
 * activa según positionMs y hace auto-scroll suave hasta ella.
 *
 * La línea activa se DERIVA del reloj en cada render (useMemo) en lugar de
 * guardarse con setState dentro de un efecto: eso cumple la regla
 * react-hooks/set-state-in-effect y evita renders en cascada.
 */
export function KaraokeLines({
  lyrics,
  positionMs,
  accent,
  variant = "panel",
}: KaraokeLinesProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const activeIndex = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < lyrics.lines.length; i++) {
      if (lyrics.lines[i].timeMs <= positionMs) idx = i;
      else break;
    }
    return idx;
  }, [lyrics, positionMs]);

  // Auto-scroll a la línea activa.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const active = container.querySelector(
      `[data-lyric-idx="${activeIndex}"]`
    ) as HTMLElement | null;
    if (active) {
      active.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIndex]);

  const maxHeightClass =
    variant === "full" ? "max-h-[calc(100vh_-_17rem)]" : "max-h-[40vh]";
  const textSize =
    variant === "full" ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl";

  return (
    <div
      ref={containerRef}
      className={cx(
        "lyrics-text text-center overflow-y-auto lozkho-scroll pr-2",
        maxHeightClass
      )}
      style={{
        ["--station-accent" as any]: accent,
        ["--station-accent-muted" as any]: hexToRgba(accent, 0.55),
        ["--station-accent-glow" as any]: hexToRgba(accent, 0.32),
      }}
    >
      <div className="h-[14vh]" />
      {lyrics.lines.map((l, i) => (
        <p
          key={i}
          data-lyric-idx={i}
          className={cx(
            "py-2 font-semibold transition-all",
            textSize,
            i === activeIndex && "karaoke-active scale-[1.02]",
            i < activeIndex && "karaoke-past",
            i > activeIndex && "karaoke-future",
            l.text.startsWith("[") && "italic text-white/35"
          )}
        >
          {l.text}
        </p>
      ))}
      <div className="h-[20vh]" />
    </div>
  );
}
