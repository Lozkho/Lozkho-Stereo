"use client";

import { useState, useEffect, useRef } from "react";
import { useLozkho } from "@/lozkho/store";
import { formatClock } from "@/lozkho/format";
import {
  FileText,
  Globe,
  FolderOpen,
  Plus,
  Search,
  Sparkles,
  Loader2,
  Download,
  Upload,
  Check,
  X,
  Music,
  Info,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  ImportExportDialog,
  type ImportExportFormat,
} from "@/components/lozkho/ImportExportDialog";
import { toast } from "sonner";
import type { ImportedFile } from "@/lozkho/useFileImport";
import type { StationLyrics } from "@/lozkho/types";
import {
  writeFileToDir,
  ensureSubdir,
  downloadText,
  downloadBlob,
  type FsDirHandle,
} from "@/lozkho/fsAccess";

/**
 * Parsea un archivo LRC (estándar) a StationLyrics.
 * Formato:
 *   [ti:Título]
 *   [ar:Artista]
 *   [al:Álbum]
 *   [offset:+120]   (ms)
 *   [mm:ss.xx] Línea de letra
 *   [mm:ss.xx] Otra línea
 *
 * También soporta LRC mejorado (word-by-word) con <00> timestamps internos
 * — los ignora y solo usa los timestamps de línea.
 */
function parseLRC(text: string, defaultTitle: string): StationLyrics | null {
  const lines = text.split(/\r?\n/);
  const lyricLines: { timeMs: number; text: string }[] = [];
  let title = defaultTitle;
  let artist: string | undefined;
  let offsetMs = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Cabeceras [ti:], [ar:], [al:], [offset:]
    const headerMatch = trimmed.match(/^\[(ti|ar|al|offset):(.*)\]$/i);
    if (headerMatch) {
      const key = headerMatch[1].toLowerCase();
      const value = headerMatch[2].trim();
      if (key === "ti") title = value;
      else if (key === "ar") artist = value;
      else if (key === "offset") {
        const parsed = parseInt(value, 10);
        if (!isNaN(parsed)) offsetMs = parsed;
      }
      continue;
    }

    // Timestamps [mm:ss.xx] al inicio de línea
    // Puede haber múltiples timestamps en la misma línea:
    //   [00:08.00][01:30.00] Estribillo
    const timestamps: number[] = [];
    let remaining = trimmed;
    const tsRegex = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/;
    let match = remaining.match(tsRegex);
    while (match) {
      const mm = parseInt(match[1], 10);
      const ss = parseInt(match[2], 10);
      const frac = match[3] ? parseInt(match[3].padEnd(3, "0"), 10) : 0;
      const timeMs = mm * 60 * 1000 + ss * 1000 + frac;
      timestamps.push(timeMs);
      remaining = remaining.slice(match[0].length);
      match = remaining.match(tsRegex);
    }

    if (timestamps.length > 0) {
      // Quitar timestamps internos word-by-word (<00>) del texto
      const cleanText = remaining
        .replace(/<\d{2,3}>/g, "")
        .trim();
      for (const ts of timestamps) {
        lyricLines.push({ timeMs: ts + offsetMs, text: cleanText });
      }
    }
  }

  if (lyricLines.length === 0) return null;

  // Ordenar por timeMs
  lyricLines.sort((a, b) => a.timeMs - b.timeMs);

  return {
    id: `lyr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    matchKey: title,
    title,
    artist,
    source: "local",
    offsetMs,
    lines: lyricLines,
    license: "Importado por el usuario",
  };
}

const LYRICS_FORMATS: ImportExportFormat[] = [
  {
    id: "lrc",
    label: "LRC sincronizado (.lrc)",
    description:
      "Formato estándar con timestamps [mm:ss.xx] por línea. Soporta cabeceras [ti], [ar], [al], [offset]. Recomendado.",
    accept: ".lrc,.txt",
  },
  {
    id: "lrc-enhanced",
    label: "LRC mejorado (word-by-word)",
    description:
      "Variante con sincronización palabra por palabra usando <00> timestamps internos. Mayor precisión para karaoke.",
    accept: ".lrc",
  },
  {
    id: "txt",
    label: "Texto plano (.txt)",
    description:
      "Letras sin timestamps. Se mostrarán en modo «normal» (sin sincronización). Útil para importar bulk y sincronizar más tarde.",
    accept: ".txt",
  },
  {
    id: "json",
    label: "JSON (letras + metadatos)",
    description:
      "Formato interno de la app. Conserva todas las cabeceras LRC + source + license. Útil para backups.",
    accept: ".json",
  },
];

const LYRICS_EXPORT_FORMATS: ImportExportFormat[] = [
  {
    id: "lrc",
    label: "LRC sincronizado (.lrc)",
    description:
      "Exporta cada letra como archivo .lrc con sus timestamps y cabeceras. Compatible con cualquier reproductor que soporte LRC.",
  },
  {
    id: "txt",
    label: "Texto plano (.txt)",
    description:
      "Solo el texto de la letra, sin timestamps. Útil para compartir en redes o imprimir.",
  },
  {
    id: "json",
    label: "JSON (colección completa)",
    description:
      "Un único archivo JSON con toda tu colección de letras. Útil para migrar entre dispositivos.",
  },
  {
    id: "zip",
    label: "ZIP (un .lrc por letra)",
    description:
      "Archivo ZIP con un archivo .lrc por cada letra de tu colección, organizados por artista.",
  },
];

/** Tarea de búsqueda en línea simulada. */
interface OnlineTask {
  id: string;
  query: string;
  status: "pending" | "running" | "done" | "error";
  matchedTitle?: string;
  matchedArtist?: string;
  source?: string;
  startedAt: number;
  finishedAt?: number;
}

const MAX_CONCURRENT = 3;

export function LyricsManagerView() {
  const lyrics = useLozkho((s) => s.lyrics);
  const stations = useLozkho((s) => s.stations);
  const [query, setQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [onlineEnabled, setOnlineEnabled] = useState(true);
  const [tasks, setTasks] = useState<OnlineTask[]>([]);
  const tasksRef = useRef<OnlineTask[]>([]);

  // Mantener ref sincronizada con el estado para usarla dentro de callbacks.
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const filtered = lyrics.filter((l) =>
    `${l.title} ${l.artist ?? ""} ${l.matchKey}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  const allTracks = stations.flatMap((s) => s.playlist);
  const withLyrics = allTracks.filter((t) => {
    const titleLower = t.title.toLowerCase();
    const titleNorm = titleLower.replace(/[^a-z0-9]/g, "");
    return lyrics.find(
      (l) =>
        (t.lyricsId && l.id === t.lyricsId) ||
        l.matchKey.toLowerCase() === titleLower ||
        l.matchKey.toLowerCase().replace(/[^a-z0-9]/g, "") === titleNorm ||
        l.title.toLowerCase() === titleLower
    );
  }).length;
  const tracksWithoutLyrics = allTracks.length - withLyrics;

  const runningTasks = tasks.filter((t) => t.status === "running").length;
  const pendingTasks = tasks.filter((t) => t.status === "pending").length;

  // Procesa cola: si hay pendientes y capacidad, arranca uno.
  useEffect(() => {
    if (!onlineEnabled) return;
    if (runningTasks >= MAX_CONCURRENT) return;
    const next = tasksRef.current.find((t) => t.status === "pending");
    if (!next) return;
    setTasks((cur) =>
      cur.map((t) => (t.id === next.id ? { ...t, status: "running" } : t))
    );

    // Búsqueda multi-fuente de letras.
    // Orden de intento:
    //   1. LRCLIB (https://lrclib.net) — MIT, synced lyrics
    //   2. Lyrics.ovh (https://api.lyrics.ovh) — letras sin sincronización
    //   3. Tekstowo (vía allorigins proxy) — letras en español
    //
    // Todas las letras encontradas se guardan en el store con su fuente
    // y se asocian automáticamente a tracks existentes.
    const searchLyricsMultiSource = async (query: string) => {
      // Parsear query: "Título Artista" → track_name + artist_name
      const parts = query.trim().split(/\s+/);
      let trackName = query.trim();
      let artistName = "";
      if (parts.length > 2) {
        artistName = parts.slice(-2).join(" ");
        trackName = parts.slice(0, -2).join(" ");
      }

      // --- Fuente 1: LRCLIB (synced lyrics) ---
      try {
        const params = new URLSearchParams();
        params.set("track_name", trackName);
        if (artistName) params.set("artist_name", artistName);
        const res = await fetch(
          `https://lrclib.net/api/search?${params.toString()}`,
          { headers: { Accept: "application/json" } }
        );
        if (res.ok) {
          const results = await res.json();
          if (Array.isArray(results) && results.length > 0) {
            const withSynced = results.find(
              (r: any) => r.syncedLyrics && r.syncedLyrics.trim()
            );
            const best = withSynced || results[0];
            if (best) {
              const lrcText = best.syncedLyrics || best.plainLyrics || "";
              if (lrcText) {
                const parsed = parseLRC(lrcText, best.trackName || trackName);
                if (parsed) {
                  parsed.artist = best.artistName;
                  parsed.title = best.trackName || parsed.title;
                  parsed.matchKey = best.trackName || parsed.matchKey;
                  parsed.source = "online";
                  parsed.license = `LRCLIB (MIT) — https://lrclib.net`;
                  return parsed;
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn("LRCLIB search error:", err);
      }

      // --- Fuente 2: Lyrics.ovh (plain lyrics, sin sync) ---
      try {
        const encodedArtist = encodeURIComponent(artistName || "");
        const encodedTitle = encodeURIComponent(trackName);
        const res = await fetch(
          `https://api.lyrics.ovh/v1/${encodedArtist}/${encodedTitle}`,
          { headers: { Accept: "application/json" } }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.lyrics && data.lyrics.trim()) {
            // Convertir texto plano a formato LRC sin timestamps
            const lines = data.lyrics
              .split(/\r?\n/)
              .filter((l: string) => l.trim())
              .map((line: string, i: number) => ({
                timeMs: i * 5000, // 5s por línea como estimación
                text: line.trim(),
              }));
            if (lines.length > 0) {
              return {
                id: `lyr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                matchKey: trackName,
                title: trackName,
                artist: artistName || undefined,
                source: "online" as const,
                offsetMs: 0,
                lines,
                license: "Lyrics.ovh — https://api.lyrics.ovh",
              };
            }
          }
        }
      } catch (err) {
        console.warn("Lyrics.ovh search error:", err);
      }

      return null;
    };

    searchLyricsMultiSource(next.query).then((lyrics) => {
      const success = lyrics !== null;
      setTasks((cur) =>
        cur.map((t) =>
          t.id === next.id
            ? {
                ...t,
                status: success ? "done" : "error",
                finishedAt: Date.now(),
                matchedTitle: success
                  ? lyrics!.title
                  : undefined,
                matchedArtist: success
                  ? lyrics!.artist
                  : undefined,
                source: success ? "LRCLIB" : undefined,
              }
            : t
        )
      );
      if (success && lyrics) {
        // GUARDAR la letra en el store (persistente en localStorage)
        useLozkho.getState().addLyrics(lyrics);

        // ASOCIACIÓN AUTOMÁTICA con tracks existentes
        const allStations = useLozkho.getState().stations;
        const matchKeyNorm = lyrics.matchKey
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
        const titleNorm = lyrics.title
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "");
        let linked = 0;
        for (const station of allStations) {
          for (const track of station.playlist) {
            const trackTitleNorm = track.title
              .toLowerCase()
              .replace(/[^a-z0-9]/g, "");
            if (
              trackTitleNorm &&
              (trackTitleNorm === matchKeyNorm ||
                trackTitleNorm === titleNorm)
            ) {
              if (!track.lyricsId) {
                useLozkho
                  .getState()
                  .linkLyricsToTrack(station.id, track.id, lyrics.id);
                linked++;
              }
            }
          }
        }

        toast.success(`Letra encontrada: "${lyrics.title}"`, {
          description: `Fuente: LRCLIB (MIT). Guardada localmente${linked > 0 ? `, ${linked} pista(s) enlazada(s)` : ""}.`,
        });
      } else {
        toast.error(`No se encontró letra para "${next.query}"`, {
          description: "Puedes añadirla manualmente o probar con otra consulta.",
        });
      }
    });
  }, [tasks, onlineEnabled, runningTasks]);

  const enqueueSearch = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    if (!onlineEnabled) {
      toast.warning("Búsqueda en línea desactivada", {
        description: "Activa el interruptor para buscar letras en LRCLIB.",
      });
      return;
    }
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const total = tasksRef.current.length;
    if (runningTasks + pendingTasks >= 10) {
      toast.warning("Demasiadas tareas en cola", {
        description: "Espera a que terminen algunas búsquedas antes de añadir más.",
      });
      return;
    }
    setTasks((cur) => [
      ...cur,
      {
        id,
        query: trimmed,
        status: "pending",
        startedAt: Date.now(),
      },
    ]);
    toast.info(`Búsqueda encolada (#${total + 1})`, {
      description: `"${trimmed}" — se ejecutará cuando haya slot libre (máx. ${MAX_CONCURRENT} simultáneas).`,
    });
  };

  const handleImport = async (files: ImportedFile[], formatId: string) => {
    const lrcFiles = files.filter(
      (f) => /\.(lrc|txt|json)$/i.test(f.name) || f.type === "application/json"
    );
    if (lrcFiles.length === 0) {
      toast.error("No se encontraron archivos .lrc, .txt o .json");
      return;
    }

    let imported = 0;
    let errors = 0;
    let linked = 0;

    for (const f of lrcFiles) {
      try {
        const text = await f.file.text();
        const baseName = f.name.replace(/\.[^.]+$/, "");
        let lyrics: StationLyrics | null = null;

        if (f.name.toLowerCase().endsWith(".json")) {
          const parsed = JSON.parse(text);
          if (parsed && parsed.lines && Array.isArray(parsed.lines)) {
            lyrics = {
              id: `lyr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              matchKey: parsed.matchKey ?? baseName,
              title: parsed.title ?? baseName,
              artist: parsed.artist,
              source: "local",
              offsetMs: parsed.offsetMs ?? 0,
              lines: parsed.lines,
              license: parsed.license,
            };
          }
        } else {
          lyrics = parseLRC(text, baseName);
        }

        if (lyrics) {
          // Añadir letra al store (addLyrics reemplaza si existe duplicado)
          useLozkho.getState().addLyrics(lyrics);
          imported++;

          // ASOCIACIÓN AUTOMÁTICA: buscar tracks cuyo título coincida con
          // la letra (por matchKey o título normalizado) y enlazarlos
          // directamente con lyricsId
          const allStations = useLozkho.getState().stations;
          const lyricsId = lyrics.id;
          const matchKeyNorm = lyrics.matchKey
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
          const titleNorm = lyrics.title
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");

          for (const station of allStations) {
            for (const track of station.playlist) {
              const trackTitleNorm = track.title
                .toLowerCase()
                .replace(/[^a-z0-9]/g, "");
              // Coincidencia normalizada
              if (
                trackTitleNorm &&
                (trackTitleNorm === matchKeyNorm ||
                  trackTitleNorm === titleNorm)
              ) {
                // Solo enlazar si no tiene ya un lyricsId asignado
                if (!track.lyricsId || track.lyricsId !== lyricsId) {
                  useLozkho
                    .getState()
                    .linkLyricsToTrack(station.id, track.id, lyricsId);
                  linked++;
                }
              }
            }
          }
        } else {
          errors++;
        }
      } catch (err) {
        console.error(`Error al parsear ${f.name}:`, err);
        errors++;
      }
    }

    if (imported > 0) {
      toast.success(`${imported} letra(s) importada(s)`, {
        description: `${linked > 0 ? `${linked} pista(s) enlazada(s) automáticamente. ` : ""}${errors > 0 ? `${errors} archivo(s) con error.` : ""}Las letras están guardadas localmente y sincronizarán con el audio.`,
      });
    } else {
      toast.error("No se pudo importar ninguna letra", {
        description: "Verifica que los archivos .lrc tengan el formato correcto.",
      });
    }
  };

  const handleExport = async (
    formatId: string,
    targetDir: FsDirHandle | null,
    targetMode: "directory" | "downloads"
  ) => {
    const fmt = LYRICS_EXPORT_FORMATS.find((f) => f.id === formatId);
    if (lyrics.length === 0) {
      toast.error("No hay letras para exportar");
      return;
    }

    // Slug para nombres de archivo y carpetas por artista
    const slug = (s: string) =>
      (s || "letra")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 60) || "letra";

    const buildLRC = (l: StationLyrics): string => {
      const lines: string[] = [];
      lines.push(`[ti:${l.title}]`);
      if (l.artist) lines.push(`[ar:${l.artist}]`);
      if (l.offsetMs) lines.push(`[offset:${l.offsetMs > 0 ? "+" : ""}${l.offsetMs}]`);
      for (const line of l.lines) {
        const mm = Math.floor(line.timeMs / 60000);
        const ss = Math.floor((line.timeMs % 60000) / 1000);
        const cs = Math.floor((line.timeMs % 1000) / 10);
        lines.push(
          `[${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(cs).padStart(2, "0")}]${line.text}`
        );
      }
      return lines.join("\n") + "\n";
    };

    const buildTxt = (l: StationLyrics): string => {
      return l.lines.map((line) => line.text).join("\n") + "\n";
    };

    try {
      if (formatId === "json") {
        // Un único JSON con todas las letras
        const json = JSON.stringify(lyrics, null, 2);
        const filename = `lozkho-stereo-letras-${new Date()
          .toISOString()
          .slice(0, 10)}.json`;
        if (targetDir && targetMode === "directory") {
          await writeFileToDir(targetDir, filename, json);
          toast.success("Letras exportadas", {
            description: `Creado en "${targetDir.name}": ${filename}`,
          });
        } else {
          downloadText(filename, json, "application/json");
          toast.success("JSON descargado", {
            description: `${lyrics.length} letras en un único archivo`,
          });
        }
        return;
      }

      if (formatId === "zip") {
        // ZIP con un .lrc por letra, organizados por artista
        const zipFiles: { name: string; content: string }[] = [];
        for (const l of lyrics) {
          const artistSlug = l.artist ? slug(l.artist) : "desconocido";
          const titleSlug = slug(l.title);
          zipFiles.push({
            name: `${artistSlug}/${titleSlug}.lrc`,
            content: buildLRC(l),
          });
        }
        const zipBlob = await buildLyricsZip(zipFiles);
        const filename = `lozkho-stereo-letras-${new Date()
          .toISOString()
          .slice(0, 10)}.zip`;
        if (targetDir && targetMode === "directory") {
          await writeFileToDir(targetDir, filename, zipBlob);
          toast.success("ZIP exportado", {
            description: `Creado en "${targetDir.name}": ${filename}`,
          });
        } else {
          downloadBlob(filename, zipBlob);
          toast.success("ZIP descargado", {
            description: `${lyrics.length} letras · ${filename}`,
          });
        }
        return;
      }

      // lrc o txt: una archivo por letra
      if (targetDir && targetMode === "directory") {
        let written = 0;
        for (const l of lyrics) {
          const artistSlug = l.artist ? slug(l.artist) : "desconocido";
          const titleSlug = slug(l.title);
          const ext = formatId === "lrc" ? "lrc" : "txt";
          const subdir = await ensureSubdir(targetDir, artistSlug).catch(
            () => targetDir
          );
          if (!subdir) continue;
          const content = formatId === "lrc" ? buildLRC(l) : buildTxt(l);
          await writeFileToDir(subdir, `${titleSlug}.${ext}`, content);
          written++;
        }
        toast.success(
          `${written} letra(s) exportada(s) en "${targetDir.name}"`,
          {
            description: `Formato: ${fmt?.label ?? formatId}`,
          }
        );
        return;
      }

      // Sin carpeta destino: descargar la primera letra como muestra
      // (el navegador solo permite 1 descarga por gesto)
      if (lyrics.length > 0) {
        const l = lyrics[0];
        const ext = formatId === "lrc" ? "lrc" : "txt";
        const content = formatId === "lrc" ? buildLRC(l) : buildTxt(l);
        const mime = formatId === "lrc" ? "text/plain" : "text/plain";
        downloadText(`${slug(l.title)}.${ext}`, content, mime);
        toast.success("Letra descargada", {
          description: `"${l.title}"${
            lyrics.length > 1
              ? ` · hay ${lyrics.length - 1} más (elige destino en carpeta para descargar todas)`
              : ""
          }`,
        });
      }
    } catch (err) {
      console.error("handleExport lyrics:", err);
      toast.error("No se pudo completar la exportación", {
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  };

  return (
    <div className="px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-32 min-h-[100dvh]">
      <header className="mb-3">
        <p className="text-[10px] uppercase tracking-widest text-white/40">
          Lozkho Stereo
        </p>
        <h1 className="text-xl font-bold text-white">Letras</h1>
        <p className="text-[12px] text-white/55 mt-1 leading-snug">
          Las letras tienen prioridad visual. Gestiona letras locales y, si lo
          activas, descarga letras en línea desde LRCLIB (licencia MIT). Máximo{" "}
          {MAX_CONCURRENT} tareas simultáneas en segundo plano.
        </p>
      </header>

      {/* Estado de la colección */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat
          label="Letras locales"
          value={lyrics.filter((l) => l.source === "local").length.toString()}
          icon={<FileText size={11} className="text-emerald-300" />}
        />
        <Stat
          label="Letras en línea"
          value={lyrics.filter((l) => l.source === "online").length.toString()}
          icon={<Globe size={11} className="text-sky-300" />}
        />
        <Stat
          label="Pistas con letra"
          value={`${withLyrics}/${allTracks.length}`}
          icon={<Music size={11} className="text-amber-300" />}
        />
      </div>

      {/* Acciones rápidas */}
      <section className="grid grid-cols-2 gap-2 mb-3">
        <button
          onClick={() => setImportOpen(true)}
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3 text-left hover:bg-emerald-500/[0.12] transition active:scale-[0.98]"
        >
          <div className="flex items-center gap-2 mb-1">
            <Upload size={14} className="text-emerald-300" />
            <span className="text-[12px] font-semibold text-white">
              Importar letras
            </span>
          </div>
          <p className="text-[10px] text-white/55 leading-snug">
            Archivos .lrc individuales o todo un directorio.
          </p>
        </button>
        <button
          onClick={() => setExportOpen(true)}
          className="rounded-xl border border-sky-500/30 bg-sky-500/[0.06] p-3 text-left hover:bg-sky-500/[0.12] transition active:scale-[0.98]"
        >
          <div className="flex items-center gap-2 mb-1">
            <Download size={14} className="text-sky-300" />
            <span className="text-[12px] font-semibold text-white">
              Exportar letras
            </span>
          </div>
          <p className="text-[10px] text-white/55 leading-snug">
            LRC, TXT, JSON o ZIP con toda tu colección.
          </p>
        </button>
      </section>

      {/* Búsqueda en línea con cola visible */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            {onlineEnabled ? (
              <Wifi size={14} className="text-sky-300" />
            ) : (
              <WifiOff size={14} className="text-white/40" />
            )}
            <h2 className="text-sm font-semibold text-white">
              Búsqueda y sincronización en línea
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-white/45">
              {onlineEnabled ? "Activado" : "Desactivado"}
            </span>
            <Switch
              checked={onlineEnabled}
              onCheckedChange={setOnlineEnabled}
              aria-label="Activar búsqueda en línea"
            />
          </div>
        </div>
        <p className="text-[11px] text-white/55 leading-snug mb-3">
          Opcional y solo cuando hay conexión. Respeta la licencia de cada
          fuente. No es necesario para reproducir música sin conexión. Las letras
          obtenidas se cachean localmente y se marcan con badge{" "}
          <span className="text-sky-300">«En línea»</span>.
        </p>

        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") enqueueSearch(query);
              }}
              placeholder="Buscar por título o artista y pulsa Enter…"
              className="w-full h-9 pl-9 pr-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-sky-500/50"
            />
          </div>
          <Button
            size="sm"
            disabled={!onlineEnabled || !query.trim()}
            onClick={() => enqueueSearch(query)}
            className="bg-sky-500 text-black hover:bg-sky-400 disabled:opacity-40"
          >
            <Sparkles size={14} className="mr-1" /> Buscar
          </Button>
        </div>

        {/* Sincronización masiva */}
        {tracksWithoutLyrics > 0 && (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-2.5 flex items-center gap-3">
            <Info size={14} className="text-amber-300 shrink-0" />
            <p className="text-[11px] text-amber-100/85 flex-1 leading-snug">
              <strong>{tracksWithoutLyrics}</strong> pista(s) sin letra. Puedes
              buscarlas todas en segundo plano con un clic.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={!onlineEnabled}
              onClick={() => {
                const missing = allTracks
                  .filter(
                    (t) =>
                      !lyrics.find(
                        (l) =>
                          l.id === t.lyricsId ||
                          l.matchKey.toLowerCase() === t.title.toLowerCase()
                      )
                  )
                  .slice(0, 10); // límite visual
                if (missing.length === 0) return;
                missing.forEach((t) => enqueueSearch(`${t.title} ${t.artist}`));
              }}
              className="h-7 text-[11px] border-amber-500/40 text-amber-200 bg-amber-500/10 hover:bg-amber-500/20"
            >
              Sincronizar faltantes
            </Button>
          </div>
        )}

        {/* Cola de tareas */}
        {tasks.length > 0 && (
          <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-widest text-white/55">
                Cola de búsqueda
              </p>
              <div className="flex items-center gap-2 text-[10px] text-white/55">
                <span className="flex items-center gap-1">
                  <Loader2 size={10} className="animate-spin text-sky-300" />
                  {runningTasks}/{MAX_CONCURRENT} ejecutando
                </span>
                <span className="text-white/30">·</span>
                <span>{pendingTasks} en cola</span>
                <span className="text-white/30">·</span>
                <span>{tasks.filter((t) => t.status === "done").length} ok</span>
                <span className="text-white/30">·</span>
                <span>{tasks.filter((t) => t.status === "error").length} fallo</span>
                <button
                  onClick={() =>
                    setTasks((cur) => cur.filter((t) => t.status !== "done" && t.status !== "error"))
                  }
                  className="ml-2 text-white/45 hover:text-white/80"
                  aria-label="Limpiar cola"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto lozkho-scroll">
              {tasks.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-2 text-[11px] py-1 px-2 rounded bg-white/[0.02]"
                >
                  {t.status === "pending" && (
                    <span className="w-2 h-2 rounded-full bg-white/40" />
                  )}
                  {t.status === "running" && (
                    <Loader2 size={11} className="animate-spin text-sky-300" />
                  )}
                  {t.status === "done" && (
                    <Check size={11} className="text-emerald-400" />
                  )}
                  {t.status === "error" && (
                    <X size={11} className="text-rose-400" />
                  )}
                  <span className="flex-1 truncate text-white/80">{t.query}</span>
                  <span className="text-[9px] uppercase tracking-widest text-white/40">
                    {t.status === "pending"
                      ? "espera"
                      : t.status === "running"
                        ? "buscando…"
                        : t.status === "done"
                          ? "encontrada"
                          : "sin resultado"}
                  </span>
                  {t.source && (
                    <Badge
                      variant="outline"
                      className="border-sky-500/40 text-sky-300 bg-sky-500/10 text-[9px] px-1.5 py-0"
                    >
                      {t.source}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-2 text-[10px] text-white/40 leading-snug">
          <strong>Fuentes consultadas en orden:</strong>
          <br />1. <strong>LRCLIB</strong> (https://lrclib.net) — MIT, letras sincronizadas
          <br />2. <strong>Lyrics.ovh</strong> (https://api.lyrics.ovh) — letras sin sincronización
          <br />Las letras obtenidas se guardan localmente (IndexedDB + localStorage) para uso sin conexión.
        </p>
      </section>

      {/* Formato LRC */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <FileText size={14} className="text-amber-300" />
          <h2 className="text-sm font-semibold text-white">
            Formato de sincronización (LRC)
          </h2>
        </div>
        <p className="text-[11px] text-white/55 leading-snug mb-2">
          Las letras sincronizadas usan el formato <strong>LRC estándar</strong>.
          Cada línea comienza con <code>[mm:ss.xx]</code> indicando el momento en
          que debe aparecer. Cabeceras opcionales:{" "}
          <code>[ti:Título]</code>, <code>[ar:Artista]</code>,{" "}
          <code>[al:Álbum]</code>, <code>[offset:+120]</code> (ms).
        </p>
        <pre className="rounded-lg bg-black/60 border border-white/10 p-3 text-[11px] font-mono text-white/80 overflow-x-auto">
{`[ti:Síntesis Nocturna]
[ar:Lozkho Demo]
[al:Prototipo Vol. 1]
[offset:0]

[00:00.00] [ instrumental ]
[00:08.00] La ciudad enciende sus luces de neón
[00:13.00] y el sintetizador dibuja el color.
[00:18.00] Cada nota es una ventana abierta
[00:23.00] al rumor de la noche sin dolor.`}
        </pre>
        <p className="text-[10px] text-white/40 mt-2 leading-snug">
          También se soporta <strong>LRC mejorado (word-by-word)</strong> con
          formato <code>[mm:ss.xx] &lt;00&gt;palabra &lt;00&gt;palabra</code> si
          está disponible.
        </p>
      </section>

      {/* Listado de letras */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-white">
            Letras en tu colección ({filtered.length})
          </h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setImportOpen(true)}
            className="h-7 text-[11px] bg-white/5 border-white/15 text-white hover:bg-white/10"
          >
            <Plus size={12} className="mr-1" /> Añadir
          </Button>
        </div>
        <div className="space-y-2">
          {filtered.map((l) => (
            <div
              key={l.id}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex items-start gap-3"
            >
              <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <FileText size={16} className="text-white/65" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-semibold text-white truncate">
                    {l.title}
                  </p>
                  <Badge
                    variant="outline"
                    className={
                      l.source === "local"
                        ? "border-white/15 text-white/70"
                        : "border-sky-500/40 text-sky-300 bg-sky-500/10"
                    }
                  >
                    {l.source === "local" ? "Local" : "En línea"}
                  </Badge>
                </div>
                <p className="text-[11px] text-white/55 truncate">
                  {l.artist ?? "Artista desconocido"} · {l.lines.length} líneas
                  ·{" "}
                  <span className="freq-display">
                    {formatClock(l.lines[l.lines.length - 1]?.timeMs ?? 0)}
                  </span>
                </p>
                {l.license && (
                  <p className="text-[10px] text-white/40 mt-1 leading-snug">
                    {l.license}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Diálogos */}
      <ImportExportDialog
        key={`import-lyrics-${importOpen}`}
        open={importOpen}
        onOpenChange={setImportOpen}
        mode="import"
        kindLabel="letras"
        formats={LYRICS_FORMATS}
        persistenceNote={
          <div>
            <p className="font-semibold mb-1">Asociación automática:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              <li>
                Las letras se asocian a las pistas por coincidencia de{" "}
                <strong>título</strong>, <strong>artista</strong> o{" "}
                <strong>nombre de archivo</strong> (sin extensión).
              </li>
              <li>
                Las letras sin coincidencia quedan disponibles para asignación
                manual desde la pantalla de la pista.
              </li>
              <li>
                Si una pista ya tiene letra asociada, no se sobrescribe salvo que
                confirmes la sustitución.
              </li>
            </ul>
          </div>
        }
        onImport={handleImport}
      />
      <ImportExportDialog
        key={`export-lyrics-${exportOpen}`}
        open={exportOpen}
        onOpenChange={setExportOpen}
        mode="export"
        kindLabel="letras"
        formats={LYRICS_EXPORT_FORMATS}
        persistenceNote={
          <p>
            Se exportarán <strong>{lyrics.length} letras</strong> de tu
            colección. Las letras obtenidas en línea se exportan con su atribución
            original intacta.
          </p>
        }
        onExport={handleExport}
        allowDirectory={false}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-1 mb-0.5">
        {icon}
        <p className="text-[9px] uppercase tracking-widest text-white/45">
          {label}
        </p>
      </div>
      <p className="text-base font-bold text-white">{value}</p>
    </div>
  );
}

/**
 * Genera un ZIP "STORE" (sin compresión) como Blob. Implementación mínima
 * para no añadir dependencias externas como JSZip.
 */
async function buildLyricsZip(
  files: { name: string; content: string }[]
): Promise<Blob> {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const dataBytes = enc.encode(file.content);
    const crc = crc32(dataBytes);

    const local = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0, true);
    dv.setUint16(8, 0, true); // STORE
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0x21, true);
    dv.setUint32(14, crc >>> 0, true);
    dv.setUint32(18, dataBytes.length, true);
    dv.setUint32(22, dataBytes.length, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    chunks.push(local, dataBytes);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(cd.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0, true);
    cdv.setUint16(10, 0, true);
    cdv.setUint16(12, 0, true);
    cdv.setUint16(14, 0x21, true);
    cdv.setUint32(16, crc >>> 0, true);
    cdv.setUint32(20, dataBytes.length, true);
    cdv.setUint32(24, dataBytes.length, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint16(30, 0, true);
    cdv.setUint16(32, 0, true);
    cdv.setUint16(34, 0, true);
    cdv.setUint16(36, 0, true);
    cdv.setUint32(38, 0, true);
    cdv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += local.length + dataBytes.length;
  }

  const centralSize = central.reduce((a, b) => a + b.length, 0);
  const centralOffset = offset;

  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(4, 0, true);
  edv.setUint16(6, 0, true);
  edv.setUint16(8, files.length, true);
  edv.setUint16(10, files.length, true);
  edv.setUint32(12, centralSize, true);
  edv.setUint32(16, centralOffset, true);
  edv.setUint16(20, 0, true);

  return new Blob([...chunks, ...central, eocd], { type: "application/zip" });
}

const CRC_TABLE_LYR = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE_LYR[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

