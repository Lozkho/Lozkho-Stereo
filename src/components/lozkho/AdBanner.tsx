"use client";

import { Megaphone } from "lucide-react";
import { hexToRgba } from "@/lozkho/format";

interface AdBannerProps {
  title: string;
  sponsor?: string;
  accent: string;
}

export function AdBanner({ title, sponsor, accent }: AdBannerProps) {
  return (
    <div
      className="rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 to-amber-500/5 p-4 flex items-center gap-3"
      style={{ boxShadow: `inset 0 0 0 1px ${hexToRgba(accent, 0.25)}` }}
    >
      <div className="w-10 h-10 rounded-full bg-amber-500/30 flex items-center justify-center shrink-0">
        <Megaphone size={18} className="text-amber-200" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-amber-300 font-mono">
          Publicidad · {sponsor ?? "Anunciante demo"}
        </p>
        <p className="text-sm text-white/90 leading-snug truncate">{title}</p>
        <p className="text-[11px] text-white/50 mt-0.5">
          No se puede pausar ni saltar — el ciclo continúa.
        </p>
      </div>
    </div>
  );
}
