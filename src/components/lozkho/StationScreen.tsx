"use client";

import { useLozkho, useActiveStation, buildExtendedPlaylist } from "@/lozkho/store";
import {
  formatClock,
  formatFrequency,
  buildStationGradient,
  hexToRgba,
  gradientThumbnail,
  cx,
  sortStationsByBand,
} from "@/lozkho/format";
import { getFontFamily } from "@/lozkho/fonts";
import type { Station } from "@/lozkho/types";
import { AdBanner } from "./AdBanner";
import { CycleEstimate } from "./CycleEstimate";
import { Settings, Radio, Music2, Disc3, Bell, Infinity as InfinityIcon, ImageIcon } from "lucide-react";

interface StationScreenProps {
  onOpenSettings: () => void;
}

export function StationScreen({ onOpenSettings }: StationScreenProps) {
  const station = useActiveStation();
  const tick = useLozkho((s) => s.tick);
  const setActiveStation = useLozkho((s) => s.setActiveStation);
  const stations = useLozkho((s) => s.stations);

  if (!station) return null;

  const extended = buildExtendedPlaylist(station);
  const current = extended[station.playback.currentItemIndex % extended.length];
  const isAd = station.playback.isAd;

  const accent = station.colors.accent;
  const accent2 = station.colors.accent2;
  const styleVars: React.CSSProperties = {
    // CSS vars del tema de la emisora (glows del degradado)
    ["--station-accent" as any]: accent,
    ["--station-accent-muted" as any]: hexToRgba(accent, 0.55),
    ["--station-accent-glow" as any]: hexToRgba(accent, 0.32),
    ["--station-glow" as any]: hexToRgba(accent, 0.32),
    ["--station-glow-bottom" as any]: hexToRgba(accent2, 0.42),
    background: buildStationGradient(accent, accent2),
  };

  return (
    <div
      className="relative min-h-[100dvh] w-full overflow-x-hidden station-vignette"
      style={styleVars}
    >
      {/* Capa negra base */}
      <div className="absolute inset-0 bg-black -z-10" />

      {/* Pequeña barra superior */}
      <header className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-2">
        <div className="flex items-center gap-2">
          <Radio size={18} style={{ color: accent }} />
          <span className="text-xs font-semibold tracking-[0.18em] uppercase text-white/70">
            Lozkho Stereo
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="live-dot text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full border flex items-center gap-1"
            style={{
              color: accent,
              borderColor: hexToRgba(accent, 0.5),
              backgroundColor: hexToRgba(accent, 0.08),
            }}
            title="Auto-reproducción continua: todas las emisoras suenan en simultáneo, solo se escucha la activa."
          >
            <InfinityIcon size={11} /> EN VIVO
          </span>
          <button
            onClick={onOpenSettings}
            aria-label="Abrir ajustes de la emisora"
            className="rounded-full p-2 text-white/80 hover:text-white hover:bg-white/10 active:scale-95 transition"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* Frecuencia tipo receptor */}
      <div className="px-4 pt-2 pb-1">
        <div className="flex items-end gap-3">
          <span
            className="freq-display text-[clamp(2.5rem,14vw,4.5rem)] font-extrabold leading-none"
            style={{
              color: accent,
              textShadow: `0 0 28px ${hexToRgba(accent, 0.45)}`,
            }}
          >
            {formatFrequency(station.frequency, station.band)}
          </span>
          <span
            className="text-2xl font-bold mb-1"
            style={{ color: hexToRgba(accent, 0.85) }}
          >
            {station.band}
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <h1
            className="text-2xl sm:text-3xl font-bold tracking-tight truncate"
            style={{
              fontFamily: getFontFamily(station.titleFont),
              color: station.titleColor ?? "#ffffff",
              ...(station.titleColor && {
                textShadow: `0 0 18px ${hexToRgba(station.titleColor, 0.35)}`,
              }),
            }}
          >
            {station.name}
          </h1>
          <span
            className="text-[11px] font-medium uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0"
            style={{
              color: accent,
              backgroundColor: hexToRgba(accent, 0.12),
              border: `1px solid ${hexToRgba(accent, 0.35)}`,
            }}
          >
            {station.mood}
          </span>
        </div>
        <p className="text-sm text-white/65 mt-1 italic">
          “{station.slogan}”
        </p>
      </div>

      {/* Miniatura estilizada + info de la pista actual */}
      <div className="px-4 pt-3">
        <NowPlayingCard
          station={station}
          isAd={isAd}
          trackTitle={current?.ref.title || "—"}
          trackArtist={
            current?.kind === "track"
              ? station.playlist.find((t) => t.id === current.ref.id)?.artist ??
                "Lozkho Demo"
              : current?.kind === "ad"
                ? (current.ref as any).sponsor ?? "Anuncio demo"
                : "—"
          }
          trackAlbum={
            current?.kind === "track"
              ? station.playlist.find((t) => t.id === current.ref.id)?.album
              : undefined
          }
          trackGenre={
            current?.kind === "track"
              ? station.playlist.find((t) => t.id === current.ref.id)?.genre
              : undefined
          }
          positionMs={station.playback.positionMs}
          durationMs={current?.ref.durationMs ?? 0}
          accent={accent}
          accent2={accent2}
        />
      </div>

      {/* Anuncio banner si aplica */}
      {isAd && (
        <div className="px-4 pt-3">
          <AdBanner
            title={current?.ref.title ?? "Anuncio"}
            sponsor={(current?.ref as any)?.sponsor}
            accent={accent}
          />
        </div>
      )}

      {/* Estimación discreta del ciclo */}
      <div className="px-4 pt-3">
        <CycleEstimate station={station} />
      </div>

      {/* Dock de emisoras (solo la activa suena) */}
      <div className="pt-6">
        <StationDock
          stations={stations}
          activeId={station.id}
          onSelect={setActiveStation}
          tick={tick}
        />
      </div>
    </div>
  );
}

interface NowPlayingCardProps {
  station: Station;
  isAd: boolean;
  trackTitle: string;
  trackArtist: string;
  trackAlbum?: string;
  trackGenre?: string;
  positionMs: number;
  durationMs: number;
  accent: string;
  accent2: string;
}

function NowPlayingCard(props: NowPlayingCardProps) {
  const {
    station,
    isAd,
    trackTitle,
    trackArtist,
    trackAlbum,
    trackGenre,
    positionMs,
    durationMs,
    accent,
    accent2,
  } = props;
  const pct = durationMs > 0 ? Math.min(100, (positionMs / durationMs) * 100) : 0;
  const thumbnailStyle: React.CSSProperties = station.thumbnailUri
    ? {
        backgroundImage: `url(${station.thumbnailUri})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : {
        background: gradientThumbnail(accent, accent2),
      };

  return (
    <div
      className={cx(
        "rounded-3xl p-4 border relative overflow-hidden",
        isAd ? "border-amber-500/40 bg-amber-500/[0.06]" : "border-white/10 bg-white/[0.03]"
      )}
    >
      <div className="flex items-center gap-4">
        <div
          className={cx(
            "relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden shrink-0",
            // Girar SIEMPRE (imagen importada o gradiente), excepto en anuncios
            !isAd && "vinyl-spin"
          )}
          style={thumbnailStyle}
          aria-hidden
        >
          {/* Si hay imagen, oscurecemos un poco el centro para legibilidad */}
          {station.thumbnailUri && !isAd && (
            <div className="absolute inset-0 bg-black/10" />
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            {isAd ? (
              <Bell size={28} className="text-black/80" />
            ) : station.thumbnailUri ? null : (
              <Disc3 size={28} className="text-black/70" />
            )}
          </div>
          {/* Agujero tipo vinilo SIEMPRE (sobre imagen o gradiente) */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-black/80 ring-2 ring-white/20" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={cx(
                "text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full",
                isAd
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "bg-white/10 text-white/70"
              )}
            >
              {isAd ? "PUBLICIDAD" : "EN EMISIÓN"}
            </span>
            {trackGenre && !isAd && (
              <span
                className="text-[10px] font-medium uppercase tracking-widest px-2 py-0.5 rounded-full"
                style={{
                  color: accent,
                  backgroundColor: "rgba(255,255,255,0.06)",
                  border: `1px solid ${hexToRgba(accent, 0.3)}`,
                }}
              >
                {trackGenre}
              </span>
            )}
          </div>
          <h2 className="text-xl sm:text-2xl font-bold leading-tight truncate text-white">
            {trackTitle}
          </h2>
          <p className="text-sm text-white/70 truncate">
            {trackGenre ? `${trackGenre} · ` : ""}{trackArtist}
          </p>
          {trackAlbum && !isAd && (
            <p className="text-xs text-white/40 truncate mt-0.5">{trackAlbum}</p>
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
      </div>
    </div>
  );
}

interface StationDockProps {
  stations: Station[];
  activeId: string;
  onSelect: (id: string) => void;
  tick: number;
}

function StationDock({ stations, activeId, onSelect }: StationDockProps) {
  return (
    <div className="px-4">
      <div className="flex items-center gap-2 mb-2">
        <Music2 size={14} className="text-white/60" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-white/60">
          Reproduciendo en segundo plano
        </h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sortStationsByBand(stations).map((s) => {
          const active = s.id === activeId;
          const ext = buildExtendedPlaylist(s);
          const cur = ext[s.playback.currentItemIndex % ext.length];
          const accent = s.colors.accent;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={cx(
                "text-left rounded-2xl p-3 border transition active:scale-[0.98]",
                active
                  ? "border-white/30 bg-white/[0.06]"
                  : "border-white/10 bg-white/[0.02] hover:bg-white/[0.04]"
              )}
              style={
                active
                  ? { boxShadow: `0 0 0 1px ${hexToRgba(accent, 0.55)}` }
                  : undefined
              }
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-xl shrink-0 overflow-hidden bg-cover bg-center vinyl-spin"
                  style={
                    s.thumbnailUri
                      ? { backgroundImage: `url(${s.thumbnailUri})` }
                      : { background: gradientThumbnail(accent, s.colors.accent2) }
                  }
                  aria-hidden
                >
                  {/* Agujero del vinilo SIEMPRE visible */}
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-black/70 ring-2 ring-white/20" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span
                      className="freq-display text-lg font-bold"
                      style={{ color: accent }}
                    >
                      {formatFrequency(s.frequency, s.band)}
                    </span>
                    <span className="text-[10px] uppercase tracking-widest text-white/40">
                      {s.band}
                    </span>
                  </div>
                  <p
                    className="text-sm font-semibold text-white truncate"
                    style={{ fontFamily: getFontFamily(s.titleFont) }}
                  >
                    {s.name}
                  </p>
                  <p className="text-xs text-white/55 truncate">
                    {s.playback.isAd ? "PUBLICIDAD" : (cur?.ref.title ?? "—")}
                  </p>
                </div>
                {active ? (
                  <span
                    className="live-dot text-[10px] uppercase tracking-widest font-mono px-2 py-0.5 rounded-full"
                    style={{
                      color: accent,
                      border: `1px solid ${hexToRgba(accent, 0.4)}`,
                    }}
                  >
                    En vivo
                  </span>
                ) : (
                  <span className="text-[10px] uppercase tracking-widest font-mono px-2 py-0.5 rounded-full border border-white/15 text-white/60 bg-white/[0.04]">
                    2º plano
                  </span>
                )}
              </div>
              <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full"
                  style={{
                    width: `${Math.min(100, (s.playback.positionMs / (cur?.ref.durationMs || 1)) * 100)}%`,
                    backgroundColor: hexToRgba(accent, 0.7),
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
