"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  Station,
  StationLyrics,
  ProtoView,
  LyricsMode,
  Band,
  FontKey,
  Track,
  Ad,
  PlayOrder,
} from "./types";
import { DEMO_STATIONS, DEMO_LYRICS } from "./demo-data";

interface LozkhoState {
  // Datos
  stations: Station[];
  lyrics: StationLyrics[];
  activeStationId: string;
  view: ProtoView;
  settingsOpen: boolean;
  lyricsMode: LyricsMode;
  /** Última actualización visual (para refrescos). */
  tick: number;

  // Acciones
  setView: (v: ProtoView) => void;
  /**
   * Cambiar de emisora: NO interrumpe la reproducción. Solo cambia cuál es
   * la "audible". Todas las emisoras siguen avanzando su reloj virtual en
   * segundo plano de forma indefinida (auto-reproducción continua).
   */
  setActiveStation: (id: string) => void;
  openSettings: (open: boolean) => void;
  setLyricsMode: (m: LyricsMode) => void;

  // Edición de la emisora activa (panel de ajustes en vivo)
  updateActiveStation: (patch: Partial<Station>) => void;
  setStationName: (name: string) => void;
  setStationFrequency: (freq: string, band: Band) => void;
  setStationMood: (mood: string) => void;
  setStationSlogan: (slogan: string) => void;
  setStationColors: (accent: string, accent2: string) => void;
  setStationAdEvery: (n: number) => void;
  setStationPlayOrder: (order: PlayOrder) => void;
  setStationTitleFont: (font: FontKey) => void;
  setStationTitleColor: (color: string | null) => void;
  setStationThumbnail: (uri: string | null) => void;

  // Edición de CUALQUIER emisora (no solo la activa)
  updateStation: (stationId: string, patch: Partial<Station>) => void;
  createStation: () => string;
  duplicateStation: (stationId: string) => string;
  deleteStation: (stationId: string) => void;

  // Edición de playlist y anuncios
  addTrackToStation: (stationId: string, track: Track) => void;
  removeTrackFromStation: (stationId: string, trackId: string) => void;
  reorderPlaylist: (
    stationId: string,
    fromIdx: number,
    toIdx: number
  ) => void;
  addAdToStation: (stationId: string, ad: Ad) => void;
  removeAdFromStation: (stationId: string, adId: string) => void;

  // Gestión de letras
  addLyrics: (lyrics: StationLyrics) => void;
  updateLyrics: (lyricsId: string, patch: Partial<StationLyrics>) => void;
  removeLyrics: (lyricsId: string) => void;
  /** Asocia una letra a un track específico de una emisora. */
  linkLyricsToTrack: (
    stationId: string,
    trackId: string,
    lyricsId: string
  ) => void;

  // Avance del reloj virtual (lo llama el ticker global)
  tickClock: (now: number) => void;

  // Reinicia el prototipo a datos demo
  resetDemo: () => void;
}

/**
 * Calcula el "playlist extendido" de una emisora: intercala anuncios cada
 * `adEvery` pistas. Devuelve array de { tipo, ref, duración }.
 *
 * El orden de las pistas respeta `station.playOrder`:
 * - "import": orden original (default)
 * - "alpha": alfabético por título
 * - "year": por año (ascendente)
 * - "artist": por artista
 * - "random": aleatorio (shuffle determinista por stationId)
 */
export function buildExtendedPlaylist(station: Station) {
  // Ordenar playlist según playOrder
  let sortedPlaylist = [...station.playlist];
  switch (station.playOrder) {
    case "alpha":
      sortedPlaylist.sort((a, b) =>
        a.title.localeCompare(b.title, "es", { sensitivity: "base" })
      );
      break;
    case "year":
      sortedPlaylist.sort(
        (a, b) => (a.year ?? 0) - (b.year ?? 0)
      );
      break;
    case "artist":
      sortedPlaylist.sort((a, b) =>
        a.artist.localeCompare(b.artist, "es", { sensitivity: "base" })
      );
      break;
    case "random":
      // Shuffle determinista: usa stationId como seed para que el orden
      // sea consistente entre renders
      const seed = station.id
        .split("")
        .reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const rng = mulberry32(seed);
      for (let i = sortedPlaylist.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [sortedPlaylist[i], sortedPlaylist[j]] = [
          sortedPlaylist[j],
          sortedPlaylist[i],
        ];
      }
      break;
    case "import":
    default:
      // Mantener orden original
      break;
  }

  const items: {
    kind: "track" | "ad";
    ref: { id: string; title: string; durationMs: number };
    index: number;
  }[] = [];
  let cursor = 0;
  let counter = 0;
  let adCursor = 0;
  const twoLoops = [...sortedPlaylist, ...sortedPlaylist];
  for (const track of twoLoops) {
    items.push({
      kind: "track",
      ref: track,
      index: cursor,
    });
    cursor++;
    counter++;
    if (counter >= station.adEvery && station.ads.length > 0) {
      const ad = station.ads[adCursor % station.ads.length];
      items.push({
        kind: "ad",
        ref: ad,
        index: adCursor % station.ads.length,
      });
      adCursor++;
      counter = 0;
    }
  }
  return items;
}

/** PRNG determinista para shuffle reproducible. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Devuelve la duración total de UNA vuelta completa del ciclo de la emisora:
 * pistas + anuncios intercalados (según `adEvery`).
 */
export function computeCycleDurationMs(station: Station): number {
  const tracksTotal = station.playlist.reduce(
    (acc, t) => acc + t.durationMs,
    0
  );
  const adEvery = Math.max(1, station.adEvery);
  // Cuántos anuncios entran en una vuelta completa de playlist:
  const adsInLoop = Math.floor(station.playlist.length / adEvery);
  const adsTotal = (station.ads || [])
    .slice(0, Math.max(1, adsInLoop))
    .reduce((acc, a) => acc + a.durationMs, 0) * Math.max(1, adsInLoop);
  return tracksTotal + adsTotal;
}

export const useLozkho = create<LozkhoState>()(
  persist(
    (set) => ({
      stations: DEMO_STATIONS,
      lyrics: DEMO_LYRICS,
      activeStationId: DEMO_STATIONS[0].id,
      view: "emisora",
      settingsOpen: false,
  lyricsMode: "karaoke",
  tick: 0,

  setView: (v) => set({ view: v }),
  /**
   * Cambiar de emisora: NO interrumpe la reproducción. Solo cambia cuál es
   * "audible". Todas siguen avanzando.
   */
  setActiveStation: (id) => set({ activeStationId: id }),
  openSettings: (open) => set({ settingsOpen: open }),
  setLyricsMode: (m) => set({ lyricsMode: m }),

  updateActiveStation: (patch) =>
    set((s) => ({
      stations: s.stations.map((st) =>
        st.id === s.activeStationId ? { ...st, ...patch } : st
      ),
    })),
  setStationName: (name) =>
    useLozkho.getState().updateActiveStation({ name: name.slice(0, 32) }),
  setStationFrequency: (freq, band) =>
    useLozkho.getState().updateActiveStation({ frequency: freq, band }),
  setStationMood: (mood) =>
    useLozkho.getState().updateActiveStation({ mood: mood.slice(0, 24) }),
  setStationSlogan: (slogan) =>
    useLozkho.getState().updateActiveStation({ slogan: slogan.slice(0, 120) }),
  setStationColors: (accent, accent2) =>
    useLozkho.getState().updateActiveStation({ colors: { accent, accent2 } }),
  setStationAdEvery: (n) =>
    useLozkho.getState().updateActiveStation({
      adEvery: Math.max(1, Math.min(8, n)),
    }),
  setStationPlayOrder: (order) =>
    useLozkho.getState().updateActiveStation({ playOrder: order }),
  setStationTitleFont: (font) =>
    useLozkho.getState().updateActiveStation({ titleFont: font }),
  setStationTitleColor: (color) =>
    useLozkho.getState().updateActiveStation({ titleColor: color }),
  setStationThumbnail: (uri) =>
    useLozkho.getState().updateActiveStation({ thumbnailUri: uri }),

  // --- Edición de CUALQUIER emisora (no solo la activa) ---
  updateStation: (stationId, patch) =>
    set((s) => ({
      stations: s.stations.map((st) =>
        st.id === stationId ? { ...st, ...patch } : st
      ),
    })),

  /**
   * Crea una nueva emisora vacía con valores por defecto, la añade al estado
   * y la convierte en activa. Devuelve el id de la nueva emisora.
   */
  createStation: () => {
    const id = `st-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    const newStation: Station = {
      id,
      name: "Nueva emisora",
      titleFont: "geist",
      titleColor: null,
      thumbnailUri: null,
      band: "FM",
      frequency: "100.0",
      mood: "Personalizado",
      slogan: "Edita esta emisora con tu estilo.",
      colors: { accent: "#F59E0B", accent2: "#7C2D12" },
      thumbnail: "gradient:amber",
      playlist: [],
      ads: [],
      adEvery: 2,
      playOrder: "import",
      playback: {
        currentItemIndex: 0,
        positionMs: 0,
        lastTickAt: now,
        running: true,
        isAd: false,
      },
    };
    set((s) => ({
      stations: [...s.stations, newStation],
      activeStationId: id,
    }));
    return id;
  },

  /**
   * Duplica una emisora existente. La nueva emisora es independiente: tiene
   * su propio playback (empieza desde cero) y su propio id. Devuelve el id nuevo.
   */
  duplicateStation: (stationId) => {
    const newId = `st-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((s) => {
      const original = s.stations.find((st) => st.id === stationId);
      if (!original) return {} as Partial<LozkhoState>;
      const now = Date.now();
      const clone: Station = {
        ...original,
        id: newId,
        name: `${original.name} (copia)`,
        playlist: original.playlist.map((t) => ({ ...t, id: `${t.id}-c${now}` })),
        ads: original.ads.map((a) => ({ ...a, id: `${a.id}-c${now}` })),
        playback: {
          currentItemIndex: 0,
          positionMs: 0,
          lastTickAt: now,
          running: true,
          isAd: false,
        },
      };
      // Insertar la copia justo después del original
      const idx = s.stations.findIndex((st) => st.id === stationId);
      const stations = [
        ...s.stations.slice(0, idx + 1),
        clone,
        ...s.stations.slice(idx + 1),
      ];
      return { stations };
    });
    return newId;
  },

  /**
   * Elimina una emisora. Si es la activa, cambia la activa a otra disponible.
   * No permite eliminar si solo queda una emisora.
   */
  deleteStation: (stationId) =>
    set((s) => {
      if (s.stations.length <= 1) return {} as Partial<LozkhoState>;
      const stations = s.stations.filter((st) => st.id !== stationId);
      let activeStationId = s.activeStationId;
      if (activeStationId === stationId) {
        activeStationId = stations[0].id;
      }
      return { stations, activeStationId };
    }),

  // --- Edición de playlist y anuncios ---
  addTrackToStation: (stationId, track) =>
    set((s) => ({
      stations: s.stations.map((st) =>
        st.id === stationId
          ? { ...st, playlist: [...st.playlist, track] }
          : st
      ),
    })),

  removeTrackFromStation: (stationId, trackId) =>
    set((s) => ({
      stations: s.stations.map((st) =>
        st.id === stationId
          ? {
              ...st,
              playlist: st.playlist.filter((t) => t.id !== trackId),
            }
          : st
      ),
    })),

  reorderPlaylist: (stationId, fromIdx, toIdx) =>
    set((s) => ({
      stations: s.stations.map((st) => {
        if (st.id !== stationId) return st;
        if (fromIdx === toIdx) return st;
        if (fromIdx < 0 || fromIdx >= st.playlist.length) return st;
        if (toIdx < 0 || toIdx >= st.playlist.length) return st;
        const next = [...st.playlist];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        return { ...st, playlist: next };
      }),
    })),

  addAdToStation: (stationId, ad) =>
    set((s) => ({
      stations: s.stations.map((st) =>
        st.id === stationId ? { ...st, ads: [...st.ads, ad] } : st
      ),
    })),

  removeAdFromStation: (stationId, adId) =>
    set((s) => ({
      stations: s.stations.map((st) =>
        st.id === stationId
          ? { ...st, ads: st.ads.filter((a) => a.id !== adId) }
          : st
      ),
    })),

  // --- Gestión de letras ---
  addLyrics: (lyrics) =>
    set((s) => {
      // Si ya existe una letra con el mismo matchKey, reemplazarla
      const existingIdx = s.lyrics.findIndex(
        (l) => l.matchKey.toLowerCase() === lyrics.matchKey.toLowerCase()
      );
      if (existingIdx >= 0) {
        const newLyrics = [...s.lyrics];
        newLyrics[existingIdx] = lyrics;
        return { lyrics: newLyrics };
      }
      return { lyrics: [...s.lyrics, lyrics] };
    }),

  updateLyrics: (lyricsId, patch) =>
    set((s) => ({
      lyrics: s.lyrics.map((l) =>
        l.id === lyricsId ? { ...l, ...patch } : l
      ),
    })),

  removeLyrics: (lyricsId) =>
    set((s) => ({
      lyrics: s.lyrics.filter((l) => l.id !== lyricsId),
    })),

  linkLyricsToTrack: (stationId, trackId, lyricsId) =>
    set((s) => ({
      stations: s.stations.map((st) =>
        st.id === stationId
          ? {
              ...st,
              playlist: st.playlist.map((t) =>
                t.id === trackId ? { ...t, lyricsId } : t
              ),
            }
          : st
      ),
    })),

  tickClock: (now) =>
    set((s) => {
      let changed = false;
      const stations = s.stations.map((st) => {
        // Auto-reproducción indefinida: TODAS las emisoras con playback.running
        // avanzan. Siempre es true por diseño (no hay forma de pausar).
        if (!st.playback.running) return st;
        const extended = buildExtendedPlaylist(st);
        if (extended.length === 0) return st;
        let { currentItemIndex, positionMs } = st.playback;
        let delta = now - st.playback.lastTickAt;
        // Capar delta a máximo 2 segundos para evitar saltos enormes
        // cuando la pestaña estuvo inactiva o el equipo en suspensión.
        // Sin este cap, un delta de horas haría saltar cientos de pistas.
        if (delta <= 0) return st;
        if (delta > 2000) delta = 2000;
        positionMs += delta;
        // Avanza de ítem si corresponde
        let safety = 0;
        const wrapped = () => {
          currentItemIndex = currentItemIndex % extended.length;
        };
        while (safety < 64) {
          const item = extended[currentItemIndex];
          if (!item) {
            currentItemIndex = 0;
            positionMs = 0;
            break;
          }
          if (positionMs >= item.ref.durationMs) {
            positionMs -= item.ref.durationMs;
            currentItemIndex = (currentItemIndex + 1) % extended.length;
            wrapped();
            safety++;
            continue;
          }
          break;
        }
        const isAd = extended[currentItemIndex]?.kind === "ad";
        changed = true;
        return {
          ...st,
          playback: {
            ...st.playback,
            currentItemIndex,
            positionMs,
            lastTickAt: now,
            isAd,
          },
        };
      });
      if (!changed) return { tick: s.tick + 1 } as Partial<LozkhoState> as any;
      return { stations, tick: s.tick + 1 } as Partial<LozkhoState> as any;
    }),

  resetDemo: () =>
    set({
      stations: DEMO_STATIONS,
      lyrics: DEMO_LYRICS,
      activeStationId: DEMO_STATIONS[0].id,
      view: "emisora",
      settingsOpen: false,
      lyricsMode: "karaoke",
    }),
    }),
    {
      name: "lozkho-stereo-v2",
      storage: createJSONStorage(() => {
        // En SSR no hay localStorage; usa memoria como fallback
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return localStorage;
      }),
      // Solo persistir datos significativos; no transient UI state.
      // Importante: NO persistir playback (positionMs, lastTickAt, etc.)
      // porque lastTickAt se vuelve stale al recargar y causa saltos enormes
      // en el reloj virtual (delta = ahora - último guardado = horas/días).
      partialize: (state) => ({
        stations: state.stations.map((s) => ({
          ...s,
          // Resetear playback al hidratar: empezar desde la primera pista
          playback: {
            currentItemIndex: 0,
            positionMs: 0,
            lastTickAt: Date.now(),
            running: true,
            isAd: false,
          },
        })),
        lyrics: state.lyrics,
        activeStationId: state.activeStationId,
        lyricsMode: state.lyricsMode,
      }),
      version: 2,
      // Si la versión persistida es antigua, mergear con defaults
      migrate: (persisted: any, _version) => {
        if (!persisted) return persisted;
        // Asegurar que al menos las emisoras demo existan si la cache está vacía
        if (!persisted.stations || persisted.stations.length === 0) {
          persisted.stations = DEMO_STATIONS;
          persisted.activeStationId = DEMO_STATIONS[0].id;
        }
        if (!persisted.lyrics || persisted.lyrics.length === 0) {
          persisted.lyrics = DEMO_LYRICS;
        }
        // Resetear playback de todas las emisoras al migrar
        // (evita saltos por lastTickAt stale)
        if (persisted.stations) {
          persisted.stations = persisted.stations.map((s: any) => ({
            ...s,
            playback: {
              currentItemIndex: 0,
              positionMs: 0,
              lastTickAt: Date.now(),
              running: true,
              isAd: false,
            },
          }));
        }
        return persisted;
      },
    }
  )
);

/** Selector: devuelve la emisora activa. */
export function useActiveStation(): Station | undefined {
  return useLozkho((s) => s.stations.find((st) => st.id === s.activeStationId));
}
