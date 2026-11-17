"use client";

import { useState } from "react";
import type { StationLyrics, Track } from "@/lozkho/types";
import { cx, hexToRgba } from "@/lozkho/format";
import { Pencil } from "lucide-react";
import { LyricsEditorDialog } from "./LyricsEditorDialog";
import { KaraokeLines } from "./KaraokeLines";

interface LyricsPanelProps {
  lyrics: StationLyrics;
  positionMs: number;
  mode: "normal" | "karaoke";
  isAd: boolean;
  accent: string;
  /** Pista actual (necesaria para el editor de letras). */
  track?: Track;
  /** ID de la emisora activa (para link/unlink). */
  stationId?: string;
}

export function LyricsPanel({
  lyrics,
  positionMs,
  mode,
  isAd,
  accent,
  track,
  stationId,
}: LyricsPanelProps) {
  const [editorOpen, setEditorOpen] = useState(false);

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
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-mono uppercase tracking-widest text-white/50">
            Letras
          </span>
          <span
            className={cx(
              "text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0",
              lyrics.source === "local"
                ? "border-white/15 text-white/70 bg-white/5"
                : "border-sky-500/40 text-sky-300 bg-sky-500/10"
            )}
          >
            {lyrics.source === "local" ? "Local" : "En línea"}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-white/40 truncate max-w-[40%] text-right hidden sm:block">
            {lyrics.artist ?? ""} — {lyrics.title}
          </span>
          {track && stationId && (
            <button
              type="button"
              onClick={() => setEditorOpen(true)}
              aria-label="Editar o reemplazar la letra"
              title="¿Esta letra no es de esta canción? Edítala o búscala aquí"
              className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border border-white/15 text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition"
              style={{ ["--station-accent" as any]: accent }}
            >
              <Pencil size={11} /> Editar
            </button>
          )}
        </div>
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
        <KaraokeLines
          lyrics={lyrics}
          positionMs={positionMs}
          accent={accent}
          variant="panel"
        />
      )}

      {lyrics.license && (
        <p className="mt-3 text-[10px] text-white/35 leading-snug">
          {lyrics.license}
        </p>
      )}

      {track && stationId && (
        <LyricsEditorDialog
          key={editorOpen ? `open-${lyrics.id}` : "closed"}
          open={editorOpen}
          onOpenChange={setEditorOpen}
          lyrics={lyrics}
          track={track}
          stationId={stationId}
          accent={accent}
        />
      )}
    </div>
  );
}
