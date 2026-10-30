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
  /** Marca de primera carga completada. Si false y stations=[], inyectar demos una vez. */
  firstLoadDone: boolean;
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
  /** Asocia una letra a un track específico de una emisora.
   *  Pasar `undefined` como lyricsId desvincula la letra del track. */
  linkLyricsToTrack: (
    stationId: string,
    trackId: string,
    lyricsId: string | undefined
  ) => void;

  // Avance del reloj virtual (lo llama el ticker global)
  tickClock: (now: number) => void;

  // Reinicia el prototipo a datos demo
  resetDemo: () => void;
  /** Elimina TODAS las emisoras del usuario, SIN inyectar demos. */
  clearAllStations: () => void;
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
      firstLoadDone: false,
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
        if (delta > 60000) delta = 60000;
        positionMs += delta;
        // Avanza de ítem si corresponde
        // IMPORTANTE: si un track tiene durationMs <= 0 (porque aún no se
        // ha leído su duración real, o porque el M3U8 importado tenía
        // #EXTINF:0), usar una duración mínima razonable (30s). Sin esto,
        // el bucle while ciclaría rápidamente por TODOS los tracks en
        // cada tick (positionMs >= 0 siempre es true), causando el bug
        // de "avanza canciones indefinidamente" al seleccionar una emisora
        // importada. La duración real se sobrescribe cuando readAudioDurationMs
        // resuelve (en handleImportTracks) o cuando se importa desde un
        // M3U8 con EXTINF válido.
        const MIN_TRACK_DURATION_MS = 30_000; // 30s
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
          const itemDurationMs =
            item.ref.durationMs > 0
              ? item.ref.durationMs
              : MIN_TRACK_DURATION_MS;
          if (positionMs >= itemDurationMs) {
            positionMs -= itemDurationMs;
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

  /** Elimina TODAS las emisoras del usuario, SIN inyectar demos. */
  clearAllStations: () =>
    set({
      stations: [],
      activeStationId: "",
      view: "emisoras",
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

        // Wrapper sobre localStorage que captura QuotaExceededError.
        // Cuando el estado es demasiado grande (p. ej. 250+ pistas con
        // URLs largas de blob: o lozkho.local/), localStorage.setItem
        // lanza QuotaExceededError. En ese caso, intentamos guardar
        // una versión mínima (solo IDs, sin sourceUri) para no perder
        // la configuración de las emisoras.
        const safeStorage = {
          getItem: (key: string): string | null => {
            try {
              return localStorage.getItem(key);
            } catch {
              return null;
            }
          },
          setItem: (key: string, value: string): void => {
            try {
              localStorage.setItem(key, value);
            } catch (e) {
              // QuotaExceededError — el estado es demasiado grande.
              // Intentar guardar una versión mínima sin sourceUri
              // (los sourceUri se restauran desde IndexedDB al cargar).
              console.warn(
                "[store] localStorage.setItem falló (quota excedida). " +
                  "Intentando guardar versión mínima sin sourceUri.",
                e
              );
              try {
                const parsed = JSON.parse(value);
                if (parsed && parsed.state && parsed.state.stations) {
                  // Strip sourceUri de todos los tracks y ads
                  parsed.state.stations = parsed.state.stations.map(
                    (s: any) => ({
                      ...s,
                      playlist: (s.playlist || []).map((t: any) => ({
                        ...t,
                        // Guardar sourceUri como null — se restaurará
                        // desde IndexedDB vía restoreAllUrls()
                        sourceUri: null,
                      })),
                      ads: (s.ads || []).map((a: any) => ({
                        ...a,
                        sourceUri: null,
                      })),
                      // Resetear thumbnailUri también (se restaura desde IndexedDB)
                      thumbnailUri: s.thumbnailUri
                        ? s.thumbnailUri.startsWith("blob:")
                          ? null
                          : s.thumbnailUri
                        : null,
                    })
                  );
                  localStorage.setItem(key, JSON.stringify(parsed));
                  console.info(
                    "[store] Versión mínima guardada (sin sourceUri). " +
                      "Los sourceUri se restaurarán desde IndexedDB al cargar."
                  );
                }
              } catch (e2) {
                console.error(
                  "[store] No se pudo guardar ni la versión mínima en localStorage.",
                  e2
                );
                // Último recurso: guardar solo los nombres e IDs de emisoras
                // para no perder la configuración del usuario
                try {
                  const parsed = JSON.parse(value);
                  const minimal = {
                    state: {
                      stations:
                        parsed?.state?.stations?.map((s: any) => ({
                          id: s.id,
                          name: s.name,
                          band: s.band,
                          frequency: s.frequency,
                          mood: s.mood,
                          slogan: s.slogan,
                          colors: s.colors,
                          titleFont: s.titleFont,
                          titleColor: s.titleColor,
                          thumbnail: s.thumbnail,
                          playOrder: s.playOrder,
                          adEvery: s.adEvery,
                          playlist: s.playlist?.map((t: any) => ({
                            id: t.id,
                            title: t.title,
                            artist: t.artist,
                            durationMs: t.durationMs,
                            license: t.license,
                          })),
                          ads: [],
                          playback: {
                            currentItemIndex: 0,
                            positionMs: 0,
                            lastTickAt: Date.now(),
                            running: true,
                            isAd: false,
                          },
                        })) ?? [],
                      lyrics: parsed?.state?.lyrics ?? [],
                      activeStationId: parsed?.state?.activeStationId,
                      lyricsMode: parsed?.state?.lyricsMode,
                    },
                    version: parsed?.version ?? 2,
                  };
                  localStorage.setItem(key, JSON.stringify(minimal));
                  console.info(
                    "[store] Versión ultra-mínima guardada (solo metadatos)."
                  );
                } catch (e3) {
                  console.error(
                    "[store] localStorage completamente inutilizable.",
                    e3
                  );
                }
              }
            }
          },
          removeItem: (key: string): void => {
            try {
              localStorage.removeItem(key);
            } catch {
              // ignore
            }
          },
        };
        return safeStorage as any;
      }),
      // Solo persistir datos significativos; no transient UI state.
      // Importante: NO persistir playback (positionMs, lastTickAt, etc.)
      // porque lastTickAt se vuelve stale al recargar y causa saltos enormes
      // en el reloj virtual (delta = ahora - último guardado = horas/días).
      //
      // CRÍTICO: NO persistir sourceUri ni thumbnailUri cuando son blob: URLs
      // o URLs de Lozkho (lozkho.local/...). Estas URLs son MUY largas
      // (especialmente las de Lozkho que codifican content:// URIs en base64)
      // y con 250+ pistas pueden exceder el límite de localStorage (5-10MB).
      //
      // Los sourceUri se restauran desde IndexedDB (audioStore) al cargar
      // la app vía restoreAllUrls(). Guardar null aquí es seguro.
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
          // Strip sourceUri de tracks: si es blob: o URL de Lozkho,
          // guardar null (se restaura desde IndexedDB). Si es http(s)://
          // remota, mantenerla (es reproducible sin IndexedDB).
          playlist: (s.playlist || []).map((t) => ({
            ...t,
            sourceUri:
              t.sourceUri &&
              (t.sourceUri.startsWith("blob:") ||
                t.sourceUri.startsWith("https://lozkho.local/") ||
                t.sourceUri.startsWith("lozkho-file://"))
                ? null
                : t.sourceUri,
          })),
          // Strip sourceUri de ads también
          ads: (s.ads || []).map((a) => ({
            ...a,
            sourceUri:
              a.sourceUri &&
              (a.sourceUri.startsWith("blob:") ||
                a.sourceUri.startsWith("https://lozkho.local/") ||
                a.sourceUri.startsWith("lozkho-file://"))
                ? null
                : a.sourceUri,
          })),
          // Strip thumbnailUri si es blob: (se restaura desde IndexedDB)
          thumbnailUri:
            s.thumbnailUri && s.thumbnailUri.startsWith("blob:")
              ? null
              : s.thumbnailUri,
        })),
        lyrics: state.lyrics,
        activeStationId: state.activeStationId,
        lyricsMode: state.lyricsMode,
        firstLoadDone: true, // persistir como ya-cargado después de la primera hidratación
      }),
      version: 2,
      // Si la versión persistida es antigua, mergear con defaults
      migrate: (persisted: any, _version) => {
        if (!persisted) return persisted;
        // NOTA: NO inyectamos emisoras demo automáticamente si el estado
        // persistido está vacío. El usuario podría haber borrado todas las
        // emisoras intencionalmente — forzar demos rompería esa acción.

        // === Eliminar demos si hay emisoras importadas ===
        // IDs de demos: st-1, st-2, st-3 (definidos en demo-data.ts)
        // Si el usuario tiene emisoras importadas (st-imp-*), las demos
        // ya no son necesarias y solo estorban. Las eliminamos automáticamente.
        if (persisted.stations && Array.isArray(persisted.stations)) {
          const demoIds = new Set(DEMO_STATIONS.map((s) => s.id));
          const hasImported = persisted.stations.some(
            (s: any) => typeof s.id === "string" && s.id.startsWith("st-imp-")
          );
          if (hasImported) {
            const before = persisted.stations.length;
            persisted.stations = persisted.stations.filter(
              (s: any) => !demoIds.has(s.id)
            );
            const removed = before - persisted.stations.length;
            if (removed > 0) {
              // Si la emisora activa era una demo, cambiar a la primera importada
              if (
                persisted.activeStationId &&
                demoIds.has(persisted.activeStationId) &&
                persisted.stations.length > 0
              ) {
                persisted.activeStationId = persisted.stations[0].id;
              }
              try {
                console.info(
                  `[migrate] Eliminadas ${removed} emisora(s) demo (hay importadas)`
                );
              } catch {
                /* ignore */
              }
            }
          }
        }

        // Resetear playback de todas las emisoras al migrar
        // (evita saltos por lastTickAt stale)
        if (persisted.stations && Array.isArray(persisted.stations)) {
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
        // Si es PRIMERA carga absoluta (sin estado previo en localStorage),
        // inicializar con demos una sola vez para que el usuario vea algo.
        // La marca firstLoadDone persiste en el propio estado.
        if (
          !persisted.firstLoadDone &&
          (!persisted.stations || persisted.stations.length === 0)
        ) {
          persisted.stations = DEMO_STATIONS;
          persisted.activeStationId = DEMO_STATIONS[0].id;
          persisted.lyrics = persisted.lyrics?.length
            ? persisted.lyrics
            : DEMO_LYRICS;
          persisted.firstLoadDone = true;
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
