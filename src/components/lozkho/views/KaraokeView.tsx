"use client";

import { useLozkho, useActiveStation } from "@/lozkho/store";
import { getCurrentItem, findLyricsForTrack } from "@/lozkho/nowPlaying";
import {
  formatClock,
  formatFrequency,
  buildStationGradient,
  hexToRgba,
  cx,
} from "@/lozkho/format";
import { getFontFamily } from "@/lozkho/fonts";
import { KaraokeLines } from "@/components/lozkho/KaraokeLines";
import { Button } from "@/components/ui/button";
import { Bell, FileText, Mic, Music2 } from "lucide-react";

/**
 * Pestaña "Karaoke" — letra sincronizada a pantalla completa de la pista que
 * está sonando en la emisora activa.
 *
 * Reutiliza la misma lógica de matching de letras que la vista Emisora
 * (nowPlaying.ts) y el mismo render sincronizado (KaraokeLines, variante
 * "full"), separado de la vista de gestión/importación de letras.
 */
export function KaraokeView() {
  const station = useActiveStation();
  const allLyrics = useLozkho((s) => s.lyrics);
  const setView = useLozkho((s) => s.setView);

  if (!station) return null;

  const accent = station.colors.accent;
  const accent2 = station.colors.accent2;

  const current = getCurrentItem(station);
  const track = current?.track;
  const lyrics = findLyricsForTrack(allLyrics, track);
  const durationMs = current?.ref.durationMs ?? 0;
  const positionMs = station.playback.positionMs;
  const pct = durationMs > 0 ? Math.min(100, (positionMs / durationMs) * 100) : 0;

  return (
    <div
      className="relative min-h-[100dvh] w-full overflow-x-hidden station-vignette"
      style={{
        ["--station-accent" as any]: accent,
        ["--station-accent-glow" as any]: hexToRgba(accent, 0.32),
        ["--station-glow" as any]: hexToRgba(accent, 0.32),
        ["--station-glow-bottom" as any]: hexToRgba(accent2, 0.42),
        background: buildStationGradient(accent, accent2),
      }}
    >
      {/* Capa negra base */}
      <div className="absolute inset-0 bg-black -z-10" />

      {/* Cabecera compacta de la emisora */}
      <header className="px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span
                className="freq-display text-2xl font-extrabold leading-none"
                style={{ color: accent }}
              >
                {formatFrequency(station.frequency, station.band)}
              </span>
              <span
                className="text-xs font-bold"
                style={{ color: hexToRgba(accent, 0.85) }}
              >
                {station.band}
              </span>
            </div>
            <h2
              className="text-sm font-bold tracking-tight truncate"
              style={{
                fontFamily: getFontFamily(station.titleFont),
                color: station.titleColor ?? "#ffffff",
              }}
            >
              {station.name}
            </h2>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border shrink-0 flex items-center gap-1"
            style={{
              color: accent,
              borderColor: hexToRgba(accent, 0.5),
              backgroundColor: hexToRgba(accent, 0.08),
            }}
          >
            <Mic size={10} /> Karaoke
          </span>
        </div>
      </header>

      {/* Pista actual + progreso */}
      <div className="px-4 pt-3 pb-4">
        <div className="flex items-center gap-2 min-w-0">
          {current?.isAd ? (
            <Bell size={16} className="shrink-0" style={{ color: accent }} />
          ) : (
            <Music2 size={16} className="shrink-0" style={{ color: accent }} />
          )}
          <h3 className="text-lg sm:text-xl font-bold leading-tight truncate text-white">
            {current?.ref.title ?? "—"}
          </h3>
        </div>
        {track && !current?.isAd && (
          <p className="text-sm text-white/60 truncate mt-0.5">
            {track.artist}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <span className="freq-display text-xs text-white/55">
            {formatClock(positionMs)}
          </span>
          <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${pct}%`,
                backgroundColor: accent,
                boxShadow: `0 0 12px ${hexToRgba(accent, 0.5)}`,
              }}
            />
          </div>
          <span className="freq-display text-xs text-white/55">
            {formatClock(durationMs)}
          </span>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="px-4 pb-32">
        {current?.isAd ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-6 text-center mt-8">
            <p className="text-xs uppercase tracking-widest text-amber-300 font-mono">
              Publicidad
            </p>
            <p className="text-sm text-white/70 mt-2">
              Las letras vuelven apenas termine el anuncio.
            </p>
          </div>
        ) : lyrics ? (
          <KaraokeLines
            lyrics={lyrics}
            positionMs={positionMs}
            accent={accent}
            variant="full"
          />
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center mt-8">
            <FileText size={28} className="mx-auto mb-2 text-white/30" />
            <p className="text-sm text-white/70">
              Esta pista no tiene letra sincronizada.
            </p>
            <p className="text-xs text-white/45 mt-1">
              Importa un archivo <code className="text-white/60">.lrc</code> o
              deja que la app lo busque en línea.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3 bg-white/5 border-white/15 text-white hover:bg-white/10 hover:text-white"
              onClick={() => setView("letras")}
            >
              Ir a Letras
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
