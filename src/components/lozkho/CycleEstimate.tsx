"use client";

import { Clock, Repeat } from "lucide-react";
import type { Station } from "@/lozkho/types";
import {
  computeCycleDurationMs,
  buildExtendedPlaylist,
} from "@/lozkho/store";
import { formatDurationLong, formatClock, hexToRgba } from "@/lozkho/format";

interface CycleEstimateProps {
  station: Station;
}

export function CycleEstimate({ station }: CycleEstimateProps) {
  const cycleMs = computeCycleDurationMs(station);
  const extended = buildExtendedPlaylist(station);
  const tracks = extended.filter((i) => i.kind === "track").length / 2; // 2 vueltas
  const ads = extended.filter((i) => i.kind === "ad").length / 2;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 flex items-center gap-3">
      <Clock size={14} className="text-white/55" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-white/55 leading-tight">
          Una vuelta completa de la emisora dura aprox.
        </p>
        <p
          className="freq-display text-sm font-semibold"
          style={{ color: station.colors.accent }}
        >
          {formatDurationLong(cycleMs)}
        </p>
      </div>
      <div className="text-right">
        <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-white/50 justify-end">
          <Repeat size={11} /> Bucle infinito
        </div>
        <p className="text-[11px] text-white/55">
          {Math.round(tracks)} pistas · {Math.round(ads)} anuncios por vuelta
        </p>
      </div>
    </div>
  );
}
