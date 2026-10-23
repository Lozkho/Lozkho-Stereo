"use client";

import { useEffect, useMemo, useRef } from "react";
import type { StationLyrics } from "@/lozkho/types";
import { cx, hexToRgba } from "@/lozkho/format";

interface LyricsPanelProps {
  lyrics: StationLyrics;
  positionMs: number;
  mode: "normal" | "karaoke";
  isAd: boolean;
  accent: string;
}

export function LyricsPanel({
  lyrics,
  positionMs,
  mode,
  isAd,
  accent,
}: LyricsPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const activeIndex = useMemo(() => {
    if (mode !== "karaoke") return -1;
    let idx = -1;
    for (let i = 0; i < lyrics.lines.length; i++) {
      if (lyrics.lines[i].timeMs <= positionMs) idx = i;
      else break;
    }
    return idx;
  }, [lyrics, positionMs, mode]);

  // Auto-scroll a la línea activa.
  useEffect(() => {
    if (mode !== "karaoke") return;
    const container = containerRef.current;
    if (!container) return;
    const active = container.querySelector(
      `[data-lyric-idx="${activeIndex}"]`
    ) as HTMLElement | null;
    if (active) {
      active.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIndex, mode]);

  if (isAd) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-4">
        <p className="text-xs uppercase tracking-widest text-amber-300 font-mono">
          Publicidad
        </p>
        <p className="text-sm text-white/70 mt-1">
          Las letras se ocultan durante la publicidad.
        </p>
      </div>
    );
  }

  return (
    <div
      className={cx(
        "rounded-3xl border border-white/10 bg-white/[0.02] overflow-hidden",
        "p-4 sm:p-5"
      )}
      style={{
        ["--station-accent" as any]: accent,
        ["--station-accent-muted" as any]: hexToRgba(accent, 0.55),
        ["--station-accent-glow" as any]: hexToRgba(accent, 0.32),
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-white/50">
            Letras
          </span>
          <span
            className={cx(
              "text-[10px] font-medium px-2 py-0.5 rounded-full border",
              lyrics.source === "local"
                ? "border-white/15 text-white/70 bg-white/5"
                : "border-sky-500/40 text-sky-300 bg-sky-500/10"
            )}
          >
            {lyrics.source === "local" ? "Local" : "En línea (demo)"}
          </span>
        </div>
        <span className="text-[10px] text-white/40 truncate max-w-[55%] text-right">
          {lyrics.artist ?? ""} — {lyrics.title}
        </span>
      </div>

      {mode === "normal" ? (
        <div className="lyrics-text text-white/85 text-base leading-relaxed max-h-[40vh] overflow-y-auto lozkho-scroll pr-2">
          {lyrics.lines
            .filter((l) => l.text.trim() !== "" && !l.text.startsWith("["))
            .map((l, i) => (
              <p key={i} className="py-0.5">
                {l.text}
              </p>
            ))}
        </div>
      ) : (
        <div
          ref={containerRef}
          className="lyrics-text text-center max-h-[40vh] overflow-y-auto lozkho-scroll pr-2"
        >
          <div className="h-[14vh]" />
          {lyrics.lines.map((l, i) => (
            <p
              key={i}
              data-lyric-idx={i}
              className={cx(
                "py-2 text-lg sm:text-xl font-semibold transition-all",
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
      )}

      {lyrics.license && (
        <p className="mt-3 text-[10px] text-white/35 leading-snug">
          {lyrics.license}
        </p>
      )}
    </div>
  );
}
