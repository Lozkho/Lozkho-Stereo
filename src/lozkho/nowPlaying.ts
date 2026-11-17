"use client";

/**
 * nowPlaying.ts — Helpers compartidos para saber "qué está sonando" y qué
 * letra le corresponde. Extraídos de StationScreen para reutilizarlos en la
 * pestaña Karaoke sin duplicar la lógica de matching.
 */

import type { Station, StationLyrics, Track } from "./types";
import { buildExtendedPlaylist } from "./store";

export interface CurrentItemInfo {
  kind: "track" | "ad";
  ref: { id: string; title: string; durationMs: number };
  index: number;
  isAd: boolean;
  /** Track real de la playlist cuando el ítem actual es una pista. */
  track?: Track;
}

/**
 * Ítem actual (pista o anuncio) de una emisora según su playback.
 */
export function getCurrentItem(station: Station): CurrentItemInfo | undefined {
  // Defensa: estados persistidos de versiones anteriores pueden traer
  // playback incompleto. Nunca debemos lanzar una excepción aquí: se
  // propagaría al render de la vista Karaoke y dejaría la app en blanco.
  if (!station || !station.playback || !Array.isArray(station.playlist)) {
    return undefined;
  }
  const extended = buildExtendedPlaylist(station);
  if (extended.length === 0) return undefined;
  const index = Number.isInteger(station.playback.currentItemIndex)
    ? Math.abs(station.playback.currentItemIndex) % extended.length
    : 0;
  const current = extended[index];
  if (!current) return undefined;
  const isAd = current.kind === "ad";
  const track = current.kind === "track"
    ? station.playlist.find((t) => t.id === current.ref.id) ??
      station.playlist[current.index ?? 0]
    : undefined;
  return {
    kind: current.kind,
    ref: current.ref,
    index: current.index,
    isAd,
    track,
  };
}

/**
 * Busca la letra de una pista:
 *   1. Por lyricsId directo del track
 *   2. Por matchKey exacto (case-insensitive)
 *   3. Por matchKey normalizado (sin acentos/espacios/puntuación)
 *   4. Por título de la letra (cabecera [ti:] del LRC)
 */
export function findLyricsForTrack(
  allLyrics: StationLyrics[],
  track?: Track
): StationLyrics | undefined {
  if (!track) return undefined;
  const titleLower = track.title.toLowerCase();
  const titleNormalized = titleLower.replace(/[^a-z0-9]/g, "");

  return allLyrics.find((l) => {
    if (track.lyricsId && l.id === track.lyricsId) return true;
    if (l.matchKey.toLowerCase() === titleLower) return true;
    const matchKeyNorm = l.matchKey.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (matchKeyNorm && matchKeyNorm === titleNormalized) return true;
    if (l.title.toLowerCase() === titleLower) return true;
    return false;
  });
}
