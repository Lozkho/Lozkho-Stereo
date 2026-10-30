"use client";

import { useState } from "react";
import { useLozkho } from "@/lozkho/store";
import { buildExtendedPlaylist, computeCycleDurationMs } from "@/lozkho/store";
import { audioStore } from "@/lozkho/audioStore";
import { lozkhoLog } from "@/lozkho/logger";
import { readAudioDurationMs } from "@/lozkho/useFileImport";
import {
  parseM3U8,
  parseStationJson,
  parseZip,
  resolveTracksWithAudioFiles,
  type ParsedStation,
} from "@/lozkho/stationImport";
import {
  writeFileToDir,
  ensureSubdir,
  downloadText,
  downloadBlob,
  type FsDirHandle,
} from "@/lozkho/fsAccess";
import {
  formatClock,
  formatFrequency,
  formatDurationLong,
  gradientThumbnail,
  hexToRgba,
  sortStationsByBand,
} from "@/lozkho/format";
import { getFontFamily } from "@/lozkho/fonts";
import {
  Plus,
  Radio,
  Repeat,
  Upload,
  Download,
  Music,
  FileText,
  Info,
  Pencil,
  Copy,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ImportExportDialog,
  type ImportExportFormat,
} from "@/components/lozkho/ImportExportDialog";
import { StationEditor } from "@/components/lozkho/StationEditor";
import { toast } from "sonner";
import type { ImportedFile } from "@/lozkho/useFileImport";
import type { Track } from "@/lozkho/types";

const STATION_FORMATS: ImportExportFormat[] = [
  {
    id: "m3u8",
    label: "M3U8 (UTF-8) + JSON sidecar",
    description:
      "Lista de reproducción M3U8 con referencias a rutas persistentes + JSON con metadatos de emisora (frecuencia, colores, mood, eslogan, programación de anuncios). Recomendado.",
    // IMPORTANTE: el accept debe incluir extensiones de audio + imagen
    // para que el picker nativo de Android (SAF) también recoja los
    // archivos binarios (mp3, png, jpg) junto con los sidecars. Si solo
    // pones .m3u8/.m3u/.json/.zip, SAF no devuelve los MP3 y entonces
    // resolveTracksWithAudioFiles recibe audioFiles=[] y no resuelve
    // nada — los tracks quedan con sourceUri "./audio/..." no reproducible.
    accept: ".m3u8,.m3u,.json,.zip,.mp3,.m4a,.aac,.flac,.ogg,.opus,.wav,.wma,.png,.jpg,.jpeg,.webp",
    defaultExt: "m3u8",
  },
  {
    id: "m3u",
    label: "M3U clásico",
    description:
      "Lista de reproducción M3U (Latin-1). Solo referencia rutas; sin metadatos avanzados. Útil para compatibilidad con otros reproductores.",
    accept: ".m3u",
    defaultExt: "m3u",
  },
  {
    id: "json",
    label: "JSON completo (sin rutas)",
    description:
      "Exporta la configuración de la emisora sin las rutas a archivos. Útil para compartir plantillas de emisoras vacías.",
    accept: ".json",
    defaultExt: "json",
  },
  {
    id: "zip",
    label: "ZIP completo (emisoras + datos)",
    description:
      "Archivo ZIP con todas las emisoras (M3U8 + JSON por emisora). Útil para backup completo. No incluye los archivos de audio, solo referencias.",
    accept: ".zip",
    defaultExt: "zip",
  },
];

const TRACK_FORMATS: ImportExportFormat[] = [
  {
    id: "audio",
    label: "Archivos de audio (MP3, M4A/AAC, FLAC, OGG, Opus, WAV)",
    description:
      "Importa archivos de audio individuales o un directorio completo. Se leerán metadatos ID3/Vorbis/FLAC al importar.",
    accept: "audio/*,.mp3,.m4a,.aac,.flac,.ogg,.opus,.wav,.wma",
  },
];

export function StationsListView() {
  const stations = useLozkho((s) => s.stations);
  const setActiveStation = useLozkho((s) => s.setActiveStation);
  const activeId = useLozkho((s) => s.activeStationId);
  const setView = useLozkho((s) => s.setView);
  const createStation = useLozkho((s) => s.createStation);
  const duplicateStation = useLozkho((s) => s.duplicateStation);
  const deleteStation = useLozkho((s) => s.deleteStation);

  const [importStationOpen, setImportStationOpen] = useState(false);
  const [exportStationOpen, setExportStationOpen] = useState(false);
  const [importTracksOpen, setImportTracksOpen] = useState(false);
  // Editor de emisora
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorStationId, setEditorStationId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<"edit" | "create">("edit");

  const openEditor = (id: string, mode: "edit" | "create" = "edit") => {
    setEditorStationId(id);
    setEditorMode(mode);
    setEditorOpen(true);
  };

  const openEditorForActive = () => {
    setEditorStationId(activeId);
    setEditorMode("edit");
    setEditorOpen(true);
  };

  const handleCreateStation = () => {
    const newId = createStation();
    openEditor(newId, "create");
    toast.success("Nueva emisora creada", {
      description: "Configúrala a continuación.",
    });
  };

  const handleDuplicateStation = (id: string, name: string) => {
    const newId = duplicateStation(id);
    toast.success("Emisora duplicada", {
      description: `"${name}" → copia independiente.`,
    });
    // Opcional: abrir editor de la nueva emisora
    openEditor(newId, "edit");
  };

  const handleDeleteStation = (id: string, name: string) => {
    if (stations.length <= 1) {
      toast.error("No se puede eliminar", {
        description: "Debe existir al menos una emisora.",
      });
      return;
    }
    if (!confirm(`¿Eliminar la emisora "${name}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    deleteStation(id);
    toast.success("Emisora eliminada", { description: name });
  };

  /**
   * Elimina TODAS las emisoras del usuario (sin inyectar demos).
   * Útil cuando hay duplicados acumulados por imports fallidos previos
   * o cuando se quiere empezar de cero antes de importar de nuevo.
   */
  const handleDeleteAllStations = () => {
    if (stations.length === 0) {
      toast.info("No hay emisoras", {
        description: "Tu lista de emisoras ya está vacía.",
      });
      return;
    }
    if (
      !confirm(
        `¿Eliminar TODAS las ${stations.length} emisoras?\n\n` +
          `Esta acción NO se puede deshacer. Los archivos de audio importados ` +
          `se conservarán en IndexedDB pero las emisoras se borran por completo. ` +
          `No se reiniciarán a demos.`
      )
    ) {
      return;
    }
    useLozkho.getState().clearAllStations();
    lozkhoLog.info(`Eliminadas ${stations.length} emisoras (sin inyectar demos)`);
    toast.success("Emisoras eliminadas", {
      description: `Se eliminaron ${stations.length} emisoras. Ya no tienes ninguna emisora. ` +
        `Importa nuevas emisoras desde la sección inferior.`,
    });
  };

  // Slug seguro para nombres de archivo/carpetas
  const slug = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "emisora";

  const handleImportStations = async (files: ImportedFile[], formatId: string) => {
    try {
    const fmt = STATION_FORMATS.find((f) => f.id === formatId);
    let imported = 0;
    let errors = 0;
    let audioAssociated = 0;
    let skippedDuplicates = 0;

    // Identificar archivos de audio reales dentro del lote (cuando se importa
    // un directorio completo, los archivos de audio se pueden usar para
    // resolver las URIs del M3U8 a blobs reproducibles).
    // IMPORTANTE: filtrar por extensión del nombre, NO por MIME type, porque
    // en Android el MIME type que viene del data URL puede ser
    // "application/octet-stream" o "audio/mpeg" inconsistente.
    const audioExtRegex = /\.(mp3|m4a|aac|flac|ogg|opus|wav|wma|alac|aiff)$/i;
    const audioFiles = files.filter((f) => audioExtRegex.test(f.name));
    const imageFiles = files.filter(
      (f) => /\.(png|jpg|jpeg|webp|gif|bmp|svg)$/i.test(f.name)
    );

    // Identificar archivos "parseables" (M3U8, JSON, ZIP) — son los que
    // pueden generar emisoras.
    const parseableFiles = files.filter((f) =>
      /\.(m3u8|m3u|json|zip)$/i.test(f.name)
    );

    lozkhoLog.info(
      `Import: lote recibido — ${files.length} archivos totales, ${audioFiles.length} audio, ${imageFiles.length} imágenes, ${parseableFiles.length} parseable (m3u8/json/zip)`
    );
    if (audioFiles.length === 0 && parseableFiles.length > 0) {
      lozkhoLog.warn(
        "Import: hay archivos parseable PERO cero archivos de audio. El track no se podrá reproducir porque resolveTracksWithAudioFiles no encontrará el MP3.",
        {
          sample: files.slice(0, 10).map((f) => ({
            name: f.name,
            type: f.type,
            size: f.size,
            rel: f.relativePath,
          })),
        }
      );
    }

    // Detectar rutas base de M3U8/M3U para marcar sus sidecar JSON como
    // "ya procesado" y evitar que el bucle principal los procese de forma
    // independiente (lo que duplicaría la emisora).
    // IMPORTANTE: usar la ruta relativa completa (no solo basename) para
    // soportar varias emisoras con el mismo basename en distintas carpetas.
    const sidecarJsonBaseNames = new Set<string>();
    for (const f of parseableFiles) {
      const lower = f.name.toLowerCase();
      if (lower.endsWith(".m3u8") || lower.endsWith(".m3u")) {
        const relPath = (f.relativePath ?? f.name).toLowerCase();
        const basePath = relPath.replace(/\.(m3u8|m3u)$/i, "");
        sidecarJsonBaseNames.add(basePath);
      }
    }

    // Si NO hay archivos parseables pero SÍ hay archivos de audio, crear
    // una emisora automáticamente a partir de la carpeta de audio.
    if (parseableFiles.length === 0 && audioFiles.length > 0) {
      // Construir el nombre de la emisora a partir del directorio padre común
      // (si todos los archivos comparten "MiMusica/...", usar "MiMusica")
      let stationName = "Carpeta importada";
      if (audioFiles[0]?.relativePath) {
        const parts = audioFiles[0].relativePath.split("/");
        if (parts.length > 1) {
          stationName = parts[0];
        }
      }

      const tracksParsed: Array<Omit<Track, "id">> = audioFiles.map((f) => {
        const baseName = (f.relativePath ?? f.name)
          .split("/")
          .pop()!
          .replace(/\.[^.]+$/, "");
        // Si el nombre del archivo tiene "artista - título", separarlo
        let title = baseName;
        let artist = "Importado";
        const dashIdx = baseName.indexOf(" - ");
        if (dashIdx > 0) {
          artist = baseName.substring(0, dashIdx).trim();
          title = baseName.substring(dashIdx + 3).trim();
        }
        return {
          title,
          artist,
          durationMs: 0,
          sourceUri: "./" + (f.relativePath ?? f.name),
          license: "Importado desde directorio",
        };
      });

      const autoStation: ParsedStation = {
        name: stationName,
        band: "FM",
        frequency: "100.0",
        mood: "Importado",
        slogan: `Emisora creada desde carpeta (${audioFiles.length} pistas)`,
        colors: { accent: "#06b6d4", accent2: "#0e7490" },
        thumbnail: "gradient:cyan",
        adEvery: 2,
        playOrder: "import",
        playlist: tracksParsed,
        ads: [],
      };

      // Procesar la emisora (igual que las parseadas de M3U8)
      const resolved = await resolveTracksWithAudioFiles(autoStation, audioFiles);
      const newId = `st-imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // Resolver thumbnail relativa (si la emisora automática tuviera una)
      const resolvedWithThumb = await resolveThumbnail(resolved, files, newId);
      const playlistWithIds = resolved.playlist.map((t, i) => ({
        ...t,
        id: `trk-${newId}-${i}`,
      }));
      useLozkho.setState((cur) => ({
        stations: [
          ...cur.stations,
          {
            id: newId,
            name: resolved.name,
            titleFont: "geist",
            titleColor: null,
            thumbnailUri: resolvedWithThumb.thumbnailUri ?? null,
            band: resolved.band || "FM",
            frequency: resolved.frequency || "100.0",
            mood: resolved.mood || "Importado",
            slogan: resolved.slogan || "",
            colors: resolved.colors || { accent: "#06b6d4", accent2: "#0e7490" },
            thumbnail: resolved.thumbnail || "gradient:cyan",
            playOrder: "import",
            adEvery: 2,
            playlist: playlistWithIds,
            ads: [],
            playback: {
              currentItemIndex: 0,
              positionMs: 0,
              lastTickAt: Date.now(),
              running: true,
              isAd: false,
            },
          },
        ],
      }));
      imported++;

      // Leer duración real de cada pista
      for (let i = 0; i < playlistWithIds.length; i++) {
        const track = playlistWithIds[i];
        if (track.sourceUri?.startsWith("blob:")) {
          audioAssociated++;
          const matched = audioFiles.find((af) => {
            const relOrName = (af.relativePath ?? af.name).toLowerCase();
            return relOrName.includes(track.title.toLowerCase());
          });
          if (matched) {
            readAudioDurationMs(matched.file).then((durationMs) => {
              if (durationMs > 0) {
                const s = useLozkho.getState();
                const station = s.stations.find((x) => x.id === newId);
                if (!station) return;
                useLozkho.getState().updateStation(newId, {
                  playlist: station.playlist.map((t) =>
                    t.id === track.id ? { ...t, durationMs } : t
                  ),
                });
              }
            });
          }
        }
      }

      toast.success(
        `Emisora creada desde carpeta (${audioFiles.length} pistas)`,
        {
          description: `"${resolved.name}" · ${audioAssociated} pistas con audio reproducible.`,
        }
      );
      return;
    }

    // Helper: deduplicar emisoras. Si ya existe una emisora con el mismo
    // nombre y EXACTAMENTE la misma playlist (mismos títulos de pistas en
    // el mismo orden), no la añadimos de nuevo.
    // NOTA: antes comparábamos solo por length, lo cual era demasiado
    // agresivo y descartaba emisoras distintas que casualmente tenían la
    // misma cantidad de pistas.
    const isDuplicateStation = (
      name: string,
      _playlistLength: number,
      playlist?: { title?: string }[]
    ): boolean => {
      const existing = useLozkho.getState().stations;
      const myName = name.toLowerCase().trim();
      return existing.some((s) => {
        if (s.name.toLowerCase().trim() !== myName) return false;
        if (!playlist || playlist.length !== s.playlist.length) return false;
        // Comparar títulos de pistas uno a uno
        return s.playlist.every(
          (t, i) =>
            (t.title ?? "").toLowerCase().trim() ===
            (playlist[i]?.title ?? "").toLowerCase().trim()
        );
      });
    };

    // Helper: resolver thumbnailUri relativa (./thumbnail.png) a blob URL
    // usando los archivos importados. Devuelve el ParsedStation con la
    // thumbnailUri ya resuelta (o null si no se encuentra el archivo).
    //
    // Si el JSON no trae thumbnailUri, busca por convención de nombre:
    // thumbnail.png, thumbnail.jpg, <station-slug>-thumbnail.*,
    // cover.* o folder.* en el mismo directorio que el M3U8/JSON.
    const resolveThumbnail = async (
      station: ParsedStation,
      allFiles: ImportedFile[],
      stationId: string
    ): Promise<ParsedStation> => {
      const uri = station.thumbnailUri;
      const imageFiles = allFiles.filter((f) =>
        /\.(png|jpg|jpeg|webp|gif|bmp|svg)$/i.test(f.name)
      );

      // Caso 1: hay thumbnailUri relativa en el JSON
      if (uri && typeof uri === "string" &&
        (uri.startsWith("./") || uri.startsWith("../") || uri.startsWith("thumbnail"))
      ) {
        const thumbName = uri.replace(/^\.\//, "").split("/").pop() ?? "";
        if (thumbName) {
          const matched = allFiles.find((f) => {
            const rel = (f.relativePath ?? f.name).toLowerCase();
            const lower = f.name.toLowerCase();
            return (
              rel.endsWith("/" + thumbName.toLowerCase()) ||
              rel === thumbName.toLowerCase() ||
              lower === thumbName.toLowerCase()
            );
          });
          if (matched) {
            try {
              const thumbKey = `thumb-${stationId}`;
              const blobUrl = await audioStore.saveFile(thumbKey, matched.file);
              return { ...station, thumbnailUri: blobUrl };
            } catch (err) {
              lozkhoLog.warn(`Thumbnail: no se pudo guardar ${thumbName}`, err);
            }
          }
          // No encontrado: null para no dejar ruta relativa inválida
          return { ...station, thumbnailUri: null };
        }
      }

      // Caso 2: buscar por convención de nombre en imágenes importadas
      // Orden de preferencia:
      // 1) thumbnail.* en cualquier carpeta
      // 2) <station-slug>-thumbnail.*
      // 3) cover.* o folder.*
      // 4) cualquier imagen .png/.jpg en el directorio raíz
      const stationSlug = (station.name || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40);

      const tryMatch = (predicate: (f: ImportedFile) => boolean): ImportedFile | undefined => {
        return imageFiles.find(predicate);
      };

      // 1) thumbnail.* — preferido
      let matched = tryMatch((f) => {
        const base = f.name.toLowerCase().replace(/\.[^.]+$/, "");
        return base === "thumbnail" || base === "thumb";
      });
      // 2) <station-slug>-thumbnail.*
      if (!matched && stationSlug) {
        matched = tryMatch((f) => {
          const base = f.name.toLowerCase().replace(/\.[^.]+$/, "");
          return (
            base === `${stationSlug}-thumbnail` ||
            base === `${stationSlug}_thumbnail` ||
            base === `${stationSlug}-thumb`
          );
        });
      }
      // 3) cover.* o folder.*
      if (!matched) {
        matched = tryMatch((f) => {
          const base = f.name.toLowerCase().replace(/\.[^.]+$/, "");
          return base === "cover" || base === "folder" || base === "album";
        });
      }
      // 4) cualquier imagen única en el lote (si solo hay 1)
      if (!matched && imageFiles.length === 1) {
        matched = imageFiles[0];
      }

      if (matched) {
        try {
          const thumbKey = `thumb-${stationId}`;
          const blobUrl = await audioStore.saveFile(thumbKey, matched.file);
          lozkhoLog.debug(`Thumbnail: auto-resuelto para "${station.name}"`, {
            file: matched.name,
            rel: matched.relativePath,
          });
          return { ...station, thumbnailUri: blobUrl };
        } catch (err) {
          lozkhoLog.warn(`Thumbnail: no se pudo guardar`, err);
        }
      }

      return station;
    };

    // Procesar SOLO archivos parseables. NO iterar sobre archivos de audio
    // binarios — el `.text()` fallaría en ellos y los contaría como errores.
    for (const f of parseableFiles) {
      try {
        const lower = f.name.toLowerCase();

        // Si es un JSON sidecar de un M3U8/M3U ya procesado, saltarlo para
        // evitar duplicar la emisora. Comparar por ruta relativa completa.
        if (lower.endsWith(".json")) {
          const relPath = (f.relativePath ?? f.name).toLowerCase();
          const basePath = relPath.replace(/\.json$/i, "");
          if (sidecarJsonBaseNames.has(basePath)) {
            continue;
          }
        }

        // Proteger contra archivos realmente enormes que podrían causar OOM.
        // 50MB es razonable: cubre ZIPs con varias emisoras + audios
        // embebidos, y JSON sidecar pesados con metadatos largos.
        if (f.size > 50 * 1024 * 1024) {
          lozkhoLog.warn(`Import: archivo muy grande, saltando: ${f.name} (${f.size} bytes)`);
          errors++;
          continue;
        }

        let text: string;
        try {
          text = await f.file.text();
        } catch (textErr) {
          console.error(`No se pudo leer ${f.name} como texto:`, textErr);
          errors++;
          continue;
        }

        let stationsParsed: ParsedStation[] = [];

        if (lower.endsWith(".zip")) {
          // ZIP: parsear entradas internas
          const result = await parseZip(f.file);
          stationsParsed = result.stations;
          if (result.errors.length > 0) {
            console.warn("ZIP errors:", result.errors);
          }
        } else if (lower.endsWith(".json")) {
          // JSON independiente (no sidecar): puede contener una o varias
          // emisoras.
          stationsParsed = parseStationJson(text);
        } else if (lower.endsWith(".m3u8") || lower.endsWith(".m3u")) {
          // M3U8/M3U: una emisora a partir de la playlist
          const station = parseM3U8(text, f.name);
          if (station) stationsParsed.push(station);

          // Buscar JSON sidecar por ruta relativa completa (mismo directorio
          // y mismo basename que el M3U8). Esto es CRÍTICO: antes solo se
          // comparaba por `name` (basename), y si todas las emisoras se
          // llaman "station.m3u8" en distintas carpetas, todas recibían el
          // sidecar de la primera.
          const myRelPath = f.relativePath ?? f.name;
          const sidecarRelPath = myRelPath.replace(/\.(m3u8|m3u)$/i, ".json");
          let sidecar = files.find(
            (other) => (other.relativePath ?? other.name) === sidecarRelPath
          );
          // Fallback: buscar por basename SOLO si no hay ambigüedad
          if (!sidecar) {
            const baseName = f.name.replace(/\.[^.]+$/, "");
            const candidates = files.filter(
              (other) => other.name.toLowerCase() === `${baseName.toLowerCase()}.json`
            );
            // Si solo hay un candidato, usarlo. Si hay varios, no usar
            // ninguno (porque no sabríamos cuál es el correcto).
            if (candidates.length === 1) {
              sidecar = candidates[0];
            }
          }
          if (sidecar) {
            try {
              const sidecarText = await sidecar.file.text();
              const sideStations = parseStationJson(sidecarText);
              if (sideStations.length > 0) {
                // Fusionar metadatos del sidecar en la playlist del M3U8
                const merged = sideStations[0];
                if (stationsParsed[0]) {
                  merged.playlist = stationsParsed[0].playlist;
                  stationsParsed[0] = merged;
                } else {
                  stationsParsed.push(merged);
                }
              }
            } catch (err) {
              console.warn(`Sidecar JSON inválido para ${f.name}:`, err);
            }
          }
        } else {
          // No es parseable (no debería ocurrir porque filtramos antes)
          continue;
        }

        // Resolver cada emisora con los archivos de audio disponibles
        for (const st of stationsParsed) {
          // Deduplicar: si ya existe una emisora con el mismo nombre y
          // la misma playlist exacta (mismos títulos), saltar.
          if (isDuplicateStation(st.name, st.playlist.length, st.playlist)) {
            skippedDuplicates++;
            continue;
          }

          const resolved = await resolveTracksWithAudioFiles(st, audioFiles);

          const newId = `st-imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          // Resolver thumbnail relativa (./thumbnail.png) a blob URL.
          // Se hace DESPUÉS de generar newId para que el thumbKey sea
          // consistente con el que busca restoreAllUrls al cargar.
          const resolvedWithThumb = await resolveThumbnail(resolved, files, newId);
          // IMPORTANTE: preservar el track.id si ya tenía uno (p. ej. si
          // resolveTracksWithAudioFiles generó uno para guardar el blob en
          // IndexedDB bajo esa key). Si lo sobreescribimos, restoreAllUrls
          // no encontrará el blob después de recargar.
          const playlistWithIds = resolved.playlist.map((t, i) => ({
            ...t,
            id: t.id ?? `trk-${newId}-${i}`,
          }));
          const adsWithIds = (resolved.ads ?? []).map((a, i) => ({
            ...a,
            id: a.id ?? `ad-${newId}-${i}`,
          }));
          useLozkho.setState((cur) => ({
            stations: [
              ...cur.stations,
              {
                id: newId,
                name: resolved.name,
                titleFont: resolved.titleFont || "geist",
                titleColor: resolved.titleColor ?? null,
                thumbnailUri: resolvedWithThumb.thumbnailUri ?? null,
                band: resolved.band || "FM",
                frequency: resolved.frequency || "100.0",
                mood: resolved.mood || "Importado",
                slogan: resolved.slogan || "",
                colors: resolved.colors || { accent: "#F59E0B", accent2: "#7C2D12" },
                thumbnail: resolved.thumbnail || "gradient:amber",
                playOrder: resolved.playOrder || "import",
                adEvery: resolved.adEvery ?? 2,
                playlist: playlistWithIds,
                ads: adsWithIds,
                playback: {
                  currentItemIndex: 0,
                  positionMs: 0,
                  lastTickAt: Date.now(),
                  running: true,
                  isAd: false,
                },
              },
            ],
          }));
          imported++;

          // Leer duración real de las pistas con blob: URL (las que se
          // resolvieron con audio real)
          for (let i = 0; i < playlistWithIds.length; i++) {
            const track = playlistWithIds[i];
            if (track.sourceUri?.startsWith("blob:")) {
              audioAssociated++;
              // Buscar el File original para leer duración
              const matched = audioFiles.find((af) => {
                const lower = af.name.toLowerCase();
                const trackTitle = track.title.toLowerCase();
                const baseLower = lower.replace(/\.[^.]+$/, "");
                return baseLower === trackTitle;
              });
              if (matched) {
                readAudioDurationMs(matched.file).then((durationMs) => {
                  if (durationMs > 0) {
                    const s = useLozkho.getState();
                    const station = s.stations.find((x) => x.id === newId);
                    if (!station) return;
                    useLozkho.getState().updateStation(newId, {
                      playlist: station.playlist.map((t) =>
                        t.id === track.id ? { ...t, durationMs } : t
                      ),
                    });
                  }
                });
              }
            }
          }
        }

        if (stationsParsed.length === 0) {
          errors++;
        }
      } catch (err) {
        lozkhoLog.error(`Import: error al importar ${f.name}`, err);
        errors++;
      }
    }

    if (imported > 0) {
      lozkhoLog.info(
        `Import OK: ${imported} emisora(s) · ${audioAssociated} con audio · ${skippedDuplicates} dup · ${errors} err`
      );
      toast.success(`${imported} emisora(s) importada(s)`, {
        description: `${
          audioAssociated > 0
            ? `${audioAssociated} pista(s) con audio reproducible asociado. `
            : ""
        }${
          skippedDuplicates > 0
            ? `${skippedDuplicates} duplicada(s) omitida(s). `
            : ""
        }${errors > 0 ? `${errors} archivo(s) con error. ` : ""}Formato: ${fmt?.label ?? formatId}.`,
      });
    } else if (skippedDuplicates > 0) {
      toast.warning("Emisoras duplicadas omitidas", {
        description: `${skippedDuplicates} emisora(s) ya existían (mismo nombre y cantidad de pistas) y se omitieron. Elimínalas primero si quieres reimportarlas.`,
      });
    } else {
      toast.error("No se pudo importar ninguna emisora", {
        description:
          "Verifica que los archivos M3U8/JSON/ZIP sean válidos. Si importas un directorio con sólo MP3, se creará una emisora automáticamente.",
      });
    }
    } catch (err) {
      console.error("Error en handleImportStations:", err);
      toast.error("Error al importar emisoras", {
        description: "Ocurrió un error inesperado. La app no se cerrará.",
      });
    }
  };

  const handleExportStations = async (
    formatId: string,
    targetDir: FsDirHandle | null,
    targetMode: "directory" | "downloads"
  ) => {
    const fmt = STATION_FORMATS.find((f) => f.id === formatId);
    const allStations = useLozkho.getState().stations;

    if (allStations.length === 0) {
      toast.error("No hay emisoras para exportar");
      return;
    }

    /**
     * Prepara una emisora para exportación:
     *  - Para tracks con blob: URL → descarga el archivo real y lo escribe
     *    en el directorio como <slug>.mp3. Reescribe sourceUri a "./<slug>.mp3".
     *  - Para tracks con http(s):// → deja intacto (URL remota reproducible).
     *  - Para tracks con content:// (demo) o sin URI → marca como
     *    "demo:no-audio" para que la importación sepa que no hay audio real.
     *
     * Devuelve:
     *  - stations: estaciones con sourceUri reescritos (para M3U8 y JSON)
     *  - audioFilesToWrite: lista de { name, blob } que deben escribirse en
     *    el directorio destino (los MP3 reales).
     *  - audioFilesForZip: lo mismo pero para el caso ZIP (se incluyen en
     *    el ZIP en vez de escribirse en el directorio).
     */
    const prepareStationForExport = async (
      station: typeof allStations[number]
    ): Promise<{
      preparedStation: typeof allStations[number];
      audioFilesToWrite: { name: string; blob: Blob }[];
      audioFilesForZip: { name: string; content: Uint8Array }[];
      thumbnailFileToWrite: { name: string; blob: Blob } | null;
      thumbnailFileForZip: { name: string; content: Uint8Array } | null;
    }> => {
      const audioFilesToWrite: { name: string; blob: Blob }[] = [];
      const audioFilesForZip: { name: string; content: Uint8Array }[] = [];

      // Helper: leer duración real desde un blob URL (para tracks con
      // durationMs=0 o durationMs=30000 placeholder).
      const readBlobDurationMs = async (blobUrl: string): Promise<number> => {
        return new Promise<number>((resolve) => {
          try {
            const audio = document.createElement("audio");
            audio.preload = "metadata";
            audio.src = blobUrl;
            const cleanup = () => {
              audio.remove();
              audio.src = "";
            };
            audio.onloadedmetadata = () => {
              const dur = audio.duration;
              cleanup();
              resolve(isFinite(dur) && dur > 0 ? Math.round(dur * 1000) : 0);
            };
            audio.onerror = () => {
              cleanup();
              resolve(0);
            };
            // Timeout de seguridad: 5s
            setTimeout(() => {
              cleanup();
              resolve(0);
            }, 5000);
          } catch {
            resolve(0);
          }
        });
      };

      const preparedPlaylist = await Promise.all(
        station.playlist.map(async (track, i) => {
          const uri = track.sourceUri ?? "";
          if (uri.startsWith("blob:")) {
            try {
              const response = await fetch(uri);
              const blob = await response.blob();
              // Nombre slug del track — incluimos índice para garantizar
              // unicidad (dos pistas con mismo título no se sobrescriben).
              const titleSlug = slug(track.title) || `pista`;
              const indexPrefix = String(i + 1).padStart(2, "0");
              const filename = `${indexPrefix}-${titleSlug}.mp3`;
              // Path relativo para M3U8 (subcarpeta "audio" del directorio)
              const relPath = `./audio/${filename}`;
              audioFilesToWrite.push({ name: filename, blob });
              audioFilesForZip.push({
                name: filename,
                content: new Uint8Array(await blob.arrayBuffer()),
              });

              // Si la duración es 0 o el placeholder 30000, intentar
              // leer la duración real antes de exportar.
              let finalDurationMs = track.durationMs;
              if (track.durationMs <= 0 || track.durationMs === 30000) {
                const realDurationMs = await readBlobDurationMs(uri);
                if (realDurationMs > 0) {
                  finalDurationMs = realDurationMs;
                }
              }

              return {
                ...track,
                sourceUri: relPath,
                durationMs: finalDurationMs,
              };
            } catch (err) {
              console.warn(`No se pudo leer blob para ${track.title}:`, err);
              return { ...track, sourceUri: "demo:no-audio" };
            }
          } else if (uri.startsWith("http://") || uri.startsWith("https://")) {
            // URL remota: dejar intacta (es reproducible)
            return track;
          } else if (uri.startsWith("content://") || !uri) {
            // Demo o sin URI: no hay audio real
            return { ...track, sourceUri: "demo:no-audio" };
          }
          return track;
        })
      );

      // Lo mismo para los anuncios (si los hay)
      const preparedAds = await Promise.all(
        (station.ads || []).map(async (ad, i) => {
          const uri = ad.sourceUri ?? "";
          if (uri.startsWith("blob:")) {
            try {
              const response = await fetch(uri);
              const blob = await response.blob();
              const titleSlug = slug(ad.title) || `anuncio`;
              const indexPrefix = String(i + 1).padStart(2, "0");
              const filename = `${indexPrefix}-${titleSlug}.mp3`;
              const relPath = `./audio/${filename}`;
              audioFilesToWrite.push({ name: filename, blob });
              audioFilesForZip.push({
                name: filename,
                content: new Uint8Array(await blob.arrayBuffer()),
              });

              // Re-leer duración si es 0 o 15000 (placeholder de anuncios)
              let finalDurationMs = ad.durationMs;
              if (ad.durationMs <= 0 || ad.durationMs === 15000) {
                const realDurationMs = await readBlobDurationMs(uri);
                if (realDurationMs > 0) {
                  finalDurationMs = realDurationMs;
                }
              }

              return {
                ...ad,
                sourceUri: relPath,
                durationMs: finalDurationMs,
              };
            } catch (err) {
              console.warn(`No se pudo leer blob para ${ad.title}:`, err);
              return { ...ad, sourceUri: "demo:no-audio" };
            }
          } else if (uri.startsWith("http://") || uri.startsWith("https://")) {
            return ad;
          } else {
            return { ...ad, sourceUri: "demo:no-audio" };
          }
        })
      );

      // Procesar miniatura: si es blob: o data:, guardarla como archivo
      // separado (thumbnail.png) y reescribir la URI a ruta relativa.
      // Esto evita que el JSON contenga un base64 enorme.
      let preparedThumbnailUri = station.thumbnailUri ?? null;
      let thumbnailFileToWrite: { name: string; blob: Blob } | null = null;
      let thumbnailFileForZip: { name: string; content: Uint8Array } | null =
        null;

      if (
        preparedThumbnailUri &&
        (preparedThumbnailUri.startsWith("blob:") ||
          preparedThumbnailUri.startsWith("data:"))
      ) {
        try {
          const response = await fetch(preparedThumbnailUri);
          const blob = await response.blob();
          const ext = blob.type.includes("png")
            ? "png"
            : blob.type.includes("jpeg") || blob.type.includes("jpg")
              ? "jpg"
              : "png";
          const filename = `thumbnail.${ext}`;
          const relPath = `./${filename}`;
          thumbnailFileToWrite = { name: filename, blob };
          thumbnailFileForZip = {
            name: filename,
            content: new Uint8Array(await blob.arrayBuffer()),
          };
          preparedThumbnailUri = relPath;
        } catch (err) {
          console.warn(`No se pudo leer thumbnail:`, err);
          // Si falla, dejar la URI original (puede ser data: enorme)
        }
      }

      return {
        preparedStation: {
          ...station,
          playlist: preparedPlaylist,
          ads: preparedAds,
          thumbnailUri: preparedThumbnailUri,
        },
        audioFilesToWrite,
        audioFilesForZip,
        thumbnailFileToWrite,
        thumbnailFileForZip,
      };
    };

    // Generadores de contenido que reciben la estación PREPARADA
    // (con sourceUris ya reescritos a rutas relativas o URLs remotas)
    // Helper: formatear duración para #EXTINF. Si la duración es 0 o
    // el placeholder 30000 (que no se pudo resolver al exportar),
    // usar -1 (desconocida según spec M3U).
    const extinfSeconds = (durationMs: number): number => {
      if (durationMs <= 0 || durationMs === 30000) return -1;
      return Math.round(durationMs / 1000);
    };

    const buildM3U8 = (station: typeof allStations[number]): string => {
      const lines: string[] = ["#EXTM3U", "#EXTENC: UTF-8"];
      lines.push(`#PLAYLIST:${station.name}`);
      lines.push(`#EXTGENRE:${station.mood}`);
      for (const track of station.playlist) {
        lines.push(
          `#EXTINF:${extinfSeconds(track.durationMs)},${track.artist} - ${track.title}`
        );
        lines.push(track.sourceUri || "");
      }
      return lines.join("\n") + "\n";
    };

    const buildM3U = (station: typeof allStations[number]): string => {
      const lines: string[] = ["#EXTM3U"];
      for (const track of station.playlist) {
        lines.push(
          `#EXTINF:${extinfSeconds(track.durationMs)},${track.artist} - ${track.title}`
        );
        lines.push(track.sourceUri || "");
      }
      return lines.join("\n") + "\n";
    };

    const buildStationJson = (station: typeof allStations[number]): string => {
      // Quitar playback (no es parte de la "plantilla" exportable)
      const { playback, ...rest } = station;
      return JSON.stringify(rest, null, 2);
    };

    // Preparar todas las emisoras (esto copia los MP3 reales al directorio
    // y reescribe los sourceUris en paralelo)
    let preparedStations: typeof allStations = [];
    let totalAudioFiles = 0;
    let skippedDemoTracks = 0;

    try {
      if (formatId === "zip") {
        // ZIP: preparar todas las emisoras y recolectar archivos de audio
        const allZipFiles: { name: string; content: string | Uint8Array }[] = [];
        for (const st of allStations) {
          const { preparedStation, audioFilesForZip, thumbnailFileForZip } =
            await prepareStationForExport(st);
          preparedStations.push(preparedStation);
          const stationSlug = slug(st.name);
          // M3U8 + JSON sidecar
          allZipFiles.push({
            name: `${stationSlug}/station.m3u8`,
            content: buildM3U8(preparedStation),
          });
          allZipFiles.push({
            name: `${stationSlug}/station.json`,
            content: buildStationJson(preparedStation),
          });
          // Archivos de audio en subcarpeta "audio"
          for (const audio of audioFilesForZip) {
            allZipFiles.push({
              name: `${stationSlug}/audio/${audio.name}`,
              content: audio.content,
            });
            totalAudioFiles++;
          }
          // Miniatura (si existe) en la raíz del directorio de la emisora
          if (thumbnailFileForZip) {
            allZipFiles.push({
              name: `${stationSlug}/${thumbnailFileForZip.name}`,
              content: thumbnailFileForZip.content,
            });
          }
          // Contar demos
          skippedDemoTracks += preparedStation.playlist.filter(
            (t) => t.sourceUri === "demo:no-audio"
          ).length;
        }
        const zipBlob = await buildZipBlobWithBinary(allZipFiles);
        const filename = `lozkho-stereo-emisoras-${new Date()
          .toISOString()
          .slice(0, 10)}.zip`;
        if (targetDir && targetMode === "directory") {
          await writeFileToDir(targetDir, filename, zipBlob);
          toast.success("ZIP exportado", {
            description: `${allStations.length} emisoras · ${totalAudioFiles} archivos de audio incluidos · ${skippedDemoTracks} pistas demo sin audio.`,
          });
        } else {
          downloadBlob(filename, zipBlob);
          toast.success("ZIP descargado", {
            description: `${filename} · ${totalAudioFiles} audios incluidos.`,
          });
        }
        return;
      }

      // Para m3u8/m3u/json: preparar emisoras y escribir archivos
      const ext = fmt?.defaultExt ?? formatId;

      if (targetDir && targetMode === "directory") {
        let written = 0;
        for (const st of allStations) {
          const { preparedStation, audioFilesToWrite, thumbnailFileToWrite } =
            await prepareStationForExport(st);
          const base = slug(st.name);
          const stationSubdir = await ensureSubdir(targetDir, base);
          // Subcarpeta "audio" dentro del directorio de la emisora
          const audioSubdir = await ensureSubdir(stationSubdir, "audio");

          // Escribir los archivos MP3 reales
          for (const audio of audioFilesToWrite) {
            try {
              await writeFileToDir(audioSubdir, audio.name, audio.blob);
              totalAudioFiles++;
            } catch (err) {
              console.warn(`No se pudo escribir ${audio.name}:`, err);
            }
          }
          // Escribir miniatura (si existe) en la raíz del directorio
          if (thumbnailFileToWrite) {
            try {
              await writeFileToDir(
                stationSubdir,
                thumbnailFileToWrite.name,
                thumbnailFileToWrite.blob
              );
            } catch (err) {
              console.warn(`No se pudo escribir thumbnail:`, err);
            }
          }
          skippedDemoTracks += preparedStation.playlist.filter(
            (t) => t.sourceUri === "demo:no-audio"
          ).length;

          // Generar el contenido con la emisora preparada
          const content =
            formatId === "m3u8"
              ? buildM3U8(preparedStation)
              : formatId === "m3u"
                ? buildM3U(preparedStation)
                : buildStationJson(preparedStation);
          // Para M3U8 también escribimos el sidecar JSON
          if (formatId === "m3u8") {
            await writeFileToDir(
              stationSubdir,
              `${base}.json`,
              buildStationJson(preparedStation)
            );
          }
          await writeFileToDir(stationSubdir, `${base}.${ext}`, content);
          written++;
        }
        toast.success(
          `${written} emisora(s) exportada(s) en "${targetDir.name}"`,
          {
            description: `${totalAudioFiles} archivos de audio copiados · ${skippedDemoTracks} pistas demo sin audio real (no sonarán).`,
          }
        );
        return;
      }

      // Sin directorio destino: descargar el primer archivo (descarga única)
      if (allStations.length >= 1) {
        const { preparedStation } = await prepareStationForExport(
          allStations[0]
        );
        const st = allStations[0];
        const base = slug(st.name);
        if (formatId === "m3u8") {
          downloadText(`${base}.m3u8`, buildM3U8(preparedStation), "audio/x-mpegurl");
          setTimeout(() => {
            downloadText(
              `${base}.json`,
              buildStationJson(preparedStation),
              "application/json"
            );
          }, 200);
          toast.success(`Emisora descargada`, {
            description: `"${st.name}" · ${allStations.length > 1 ? `hay ${allStations.length - 1} más (elige destino en carpeta para exportar TODAS con sus audios).` : "exportada correctamente."} Nota: el M3U8 referencia rutas relativas ./audio/*.mp3; los MP3 no se descargan automáticamente — usa destino en carpeta para incluirlos.`,
          });
          return;
        }
        if (formatId === "m3u") {
          downloadText(`${base}.m3u`, buildM3U(preparedStation), "audio/x-mpegurl");
          toast.success("M3U descargado", {
            description: `"${st.name}"`,
          });
          return;
        }
        if (formatId === "json") {
          // JSON puro: todas las emisoras en un único archivo
          const allPrepared: typeof allStations = [];
          for (const st of allStations) {
            const { preparedStation } = await prepareStationForExport(st);
            allPrepared.push(preparedStation);
          }
          const allJson = JSON.stringify(
            allPrepared.map((st) => {
              const { playback, ...rest } = st;
              return rest;
            }),
            null,
            2
          );
          downloadText(
            `lozkho-stereo-emisoras-${new Date().toISOString().slice(0, 10)}.json`,
            allJson,
            "application/json"
          );
          toast.success("JSON descargado", {
            description: `${allStations.length} emisoras · ${totalAudioFiles} audios referenciados (no incluidos en este formato; usa M3U8 en carpeta para incluirlos).`,
          });
          return;
        }
      }
    } catch (err) {
      console.error("handleExportStations:", err);
      toast.error("No se pudo completar la exportación", {
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  };

  const handleExportTracks = async (
    _formatId: string,
    targetDir: FsDirHandle | null,
    targetMode: "directory" | "downloads"
  ) => {
    // Exportar los archivos de audio de la emisora activa
    const station = useLozkho.getState().stations.find(
      (s) => s.id === useLozkho.getState().activeStationId
    );
    if (!station || station.playlist.length === 0) {
      toast.error("La emisora activa no tiene pistas para exportar");
      return;
    }

    let written = 0;
    let failed = 0;
    const sub = targetDir && targetMode === "directory"
      ? await ensureSubdir(targetDir, slug(station.name)).catch(() => targetDir)
      : null;

    for (const track of station.playlist) {
      const uri = track.sourceUri;
      if (!uri || (!uri.startsWith("blob:") && !uri.startsWith("http"))) {
        failed++;
        continue;
      }
      try {
        let blob: Blob | null = null;
        if (uri.startsWith("blob:")) {
          blob = await fetch(uri).then((r) => r.blob());
        } else {
          blob = await fetch(uri).then((r) => r.blob());
        }
        if (!blob) {
          failed++;
          continue;
        }
        if (sub) {
          await writeFileToDir(sub, `${track.title.replace(/[\/\\:*?"<>|]/g, "_")}.mp3`, blob);
          written++;
        } else {
          downloadBlob(
            `${track.title.replace(/[\/\\:*?"<>|]/g, "_")}.mp3`,
            blob
          );
          written++;
        }
      } catch (err) {
        console.error("Export track:", err);
        failed++;
      }
    }
    if (written > 0) {
      toast.success(`${written} pista(s) exportada(s)`, {
        description: sub
          ? `Carpeta: ${sub.name}`
          : "Descargadas (solo la primera descarga es automática)",
      });
    } else {
      toast.error("No se pudo exportar ninguna pista");
    }
  };

  const handleImportTracks = async (files: ImportedFile[], formatId: string) => {
    const audioFiles = files.filter(
      (f) =>
        f.type.startsWith("audio/") ||
        /\.(mp3|m4a|aac|flac|ogg|opus|wav|wma)$/i.test(f.name)
    );
    if (audioFiles.length === 0) {
      toast.error("No se encontraron archivos de audio");
      return;
    }
    const stationId = activeId;
    // Duración temporal: hasta que readAudioDurationMs resuelva, usar 30s
    // para que el reloj virtual no cicla indefinidamente por todas las
    // pistas (bug: "avanza canciones indefinidamente" al importar).
    const TEMP_DURATION_MS = 30_000;
    for (let i = 0; i < audioFiles.length; i++) {
      const f = audioFiles[i];
      const baseName = f.name.replace(/\.[^.]+$/, "");
      const trackId = `trk-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
      const blobUrl = await audioStore.saveFile(trackId, f.file);
      const track = {
        id: trackId,
        title: baseName,
        artist: "Artista desconocido",
        genre: undefined,
        durationMs: TEMP_DURATION_MS,
        sourceUri: blobUrl,
        license: "Importado por el usuario",
      };
      useLozkho.getState().addTrackToStation(stationId, track);
      // Leer duración real (sobrescribe la temporal cuando resuelva)
      readAudioDurationMs(f.file).then((durationMs) => {
        if (durationMs > 0) {
          useLozkho.getState().updateStation(stationId, {
            playlist: useLozkho
              .getState()
              .stations.find((s) => s.id === stationId)
              ?.playlist.map((t) => (t.id === trackId ? { ...t, durationMs } : t)) ?? [],
          });
        }
      });
    }
    toast.success(`${audioFiles.length} pista(s) añadida(s) a la emisora activa`, {
      description: "Archivos guardados localmente (IndexedDB).",
    });
  };

  return (
    <div className="px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-32 min-h-[100dvh]">
      <header className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/40">
            Lozkho Stereo · {stations.length} emisora(s)
          </p>
          <h1 className="text-xl font-bold text-white">Tus emisoras</h1>
        </div>
        <div className="flex items-center gap-2">
          {stations.length > 1 && (
            <Button
              size="sm"
              variant="outline"
              className="bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20 hover:text-rose-200"
              onClick={handleDeleteAllStations}
              title="Elimina TODAS las emisoras (excepto la demo) y empieza de cero. Útil cuando hay duplicados acumulados por imports fallidos."
            >
              <Trash2 size={14} className="mr-1" /> Limpiar todo
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="bg-white/5 border-white/15 text-white hover:bg-white/10"
            onClick={() => setImportStationOpen(true)}
          >
            <Upload size={14} className="mr-1" /> Importar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="bg-white/5 border-white/15 text-white hover:bg-white/10"
            onClick={() => setExportStationOpen(true)}
          >
            <Download size={14} className="mr-1" /> Exportar
          </Button>
        </div>
      </header>

      {/* Acciones rápidas */}
      <section className="grid grid-cols-2 gap-2 mb-3">
        <button
          onClick={openEditorForActive}
          className="rounded-xl border border-sky-500/30 bg-sky-500/[0.06] p-3 text-left hover:bg-sky-500/[0.12] transition active:scale-[0.98]"
        >
          <div className="flex items-center gap-2 mb-1">
            <Pencil size={14} className="text-sky-300" />
            <span className="text-[12px] font-semibold text-white">
              Editar emisora activa
            </span>
          </div>
          <p className="text-[10px] text-white/55 leading-snug">
            Modifica identidad, apariencia, playlist y anuncios.
          </p>
        </button>
        <button
          onClick={handleCreateStation}
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3 text-left hover:bg-emerald-500/[0.12] transition active:scale-[0.98]"
        >
          <div className="flex items-center gap-2 mb-1">
            <Plus size={14} className="text-emerald-300" />
            <span className="text-[12px] font-semibold text-white">
              Crear nueva emisora
            </span>
          </div>
          <p className="text-[10px] text-white/55 leading-snug">
            Crea una emisora vacía y abre el editor para configurarla.
          </p>
        </button>
      </section>

      <div className="space-y-3">
        {sortStationsByBand(stations).map((s) => {
          const active = s.id === activeId;
          const accent = s.colors.accent;
          const cycle = computeCycleDurationMs(s);
          const extended = buildExtendedPlaylist(s);
          const cur = extended[s.playback.currentItemIndex % extended.length];
          return (
            <div
              key={s.id}
              className="block w-full text-left rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden"
              style={
                active
                  ? { boxShadow: `0 0 0 1px ${hexToRgba(accent, 0.55)}` }
                  : undefined
              }
            >
              {/* Zona clicable: cambiar de emisora activa */}
              <button
                onClick={() => {
                  setActiveStation(s.id);
                  setView("emisora");
                }}
                className="block w-full text-left p-4 hover:bg-white/[0.02] transition"
                aria-label={`Activar emisora ${s.name}`}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="relative w-16 h-16 rounded-2xl overflow-hidden shrink-0 bg-cover bg-center vinyl-spin"
                    style={
                      s.thumbnailUri
                        ? { backgroundImage: `url(${s.thumbnailUri})` }
                        : { background: gradientThumbnail(accent, s.colors.accent2) }
                    }
                    aria-hidden
                  >
                    {/* Agujero del vinilo SIEMPRE visible */}
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-black/80 ring-2 ring-white/20" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span
                        className="freq-display text-2xl font-bold"
                        style={{ color: accent }}
                      >
                        {formatFrequency(s.frequency, s.band)}
                      </span>
                      <span className="text-[10px] uppercase tracking-widest text-white/40">
                        {s.band}
                      </span>
                    </div>
                    <p
                      className="text-base font-semibold text-white truncate"
                      style={{ fontFamily: getFontFamily(s.titleFont) }}
                    >
                      {s.name}
                    </p>
                    <p className="text-xs text-white/55 truncate">{s.mood}</p>
                  </div>
                  <div className="text-right">
                    {active ? (
                      <Badge
                        variant="secondary"
                        className="bg-white/10 text-white border-white/15"
                      >
                        <Radio size={10} className="mr-1" /> Sonando
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
                      >
                        <span className="live-dot w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1" />{" "}
                        2º plano
                      </Badge>
                    )}
                  </div>
                </div>
              </button>

              {/* Estadísticas */}
              <div className="px-4 pb-2">
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="rounded-lg bg-white/[0.03] p-2 border border-white/10">
                    <p className="text-white/45 uppercase tracking-widest text-[9px]">
                      Pistas
                    </p>
                    <p className="text-white/85 font-semibold">{s.playlist.length}</p>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] p-2 border border-white/10">
                    <p className="text-white/45 uppercase tracking-widest text-[9px]">
                      Anuncios
                    </p>
                    <p className="text-white/85 font-semibold">{s.ads.length}</p>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] p-2 border border-white/10">
                    <p className="text-white/45 uppercase tracking-widest text-[9px]">
                      Ciclo
                    </p>
                    <p className="text-white/85 font-semibold">
                      {formatDurationLong(cycle)}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-white/55">
                  {active ? "Sonando ahora: " : "En segundo plano: "}
                  <span className="text-white/85">{cur?.ref.title ?? "—"}</span>{" "}
                  ·{" "}
                  <span className="freq-display">
                    {formatClock(s.playback.positionMs)} /{" "}
                    {formatClock(cur?.ref.durationMs ?? 0)}
                  </span>
                </p>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-white/45 uppercase tracking-widest">
                  <Repeat size={11} /> Bucle infinito · Anuncios cada {s.adEvery}{" "}
                  pistas
                </div>
              </div>

              {/* Barra de acciones */}
              <div className="flex items-center gap-1 px-4 pb-3 pt-1 border-t border-white/5 mt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openEditor(s.id, "edit")}
                  className="h-7 text-[11px] bg-white/5 border-white/15 text-white hover:bg-white/10 hover:text-white"
                >
                  <Pencil size={11} className="mr-1" /> Editar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleDuplicateStation(s.id, s.name)}
                  className="h-7 text-[11px] bg-white/5 border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <Copy size={11} className="mr-1" /> Duplicar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleDeleteStation(s.id, s.name)}
                  disabled={stations.length <= 1}
                  className="h-7 text-[11px] bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20 hover:text-rose-200 disabled:opacity-30"
                >
                  <Trash2 size={11} className="mr-1" /> Eliminar
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={handleCreateStation}
        className="mt-4 w-full rounded-3xl border-2 border-dashed border-white/15 bg-white/[0.02] p-5 text-white/60 hover:bg-white/[0.04] hover:text-white/80 transition flex items-center justify-center gap-2"
      >
        <Plus size={18} /> Crear nueva emisora
      </button>

      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <h2 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <Info size={14} className="text-white/60" />
          Formatos y límites de importación/exportación
        </h2>
        <p className="text-[12px] text-white/65 leading-relaxed">
          Formato principal: <strong>M3U8</strong> (UTF-8) + JSON sidecar para
          metadatos. Alternativas: M3U clásico, JSON puro, ZIP completo.
        </p>
        <ul className="mt-2 space-y-1 text-[11px] text-white/55 list-disc pl-5">
          <li>
            M3U8/M3U solo referencia rutas a archivos; no transporta metadatos
            de género, carátula ni letras. Esos se enriquecen desde las
            etiquetas ID3/FLAC/Vorbis al importar.
          </li>
          <li>
            En Android 10+ las rutas se conservan como <code>content://</code>{" "}
            persistentes (SAF con <code>takePersistableUriPermission</code>), no
            como rutas de archivos planas.
          </li>
          <li>
            En Windows se conservan rutas absolutas (con permiso de carpeta) o
            symlinks bajo el directorio de datos de la app.
          </li>
          <li>
            Las emisoras se pueden exportar como JSON junto al M3U8 para no
            perder frecuencia, colores, mood, eslogan y programación de anuncios.
          </li>
          <li>
            El ZIP completo contiene todas las emisoras (M3U8 + JSON por cada
            una) pero <strong>no</strong> los archivos de audio — solo
            referencias. Útil para backups de configuración.
          </li>
        </ul>
      </section>

      {/* Diálogos */}
      <ImportExportDialog
        key={`import-stations-${importStationOpen}`}
        open={importStationOpen}
        onOpenChange={setImportStationOpen}
        mode="import"
        kindLabel="emisora(s)"
        formats={STATION_FORMATS}
        onImport={handleImportStations}
      />
      <ImportExportDialog
        key={`export-stations-${exportStationOpen}`}
        open={exportStationOpen}
        onOpenChange={setExportStationOpen}
        mode="export"
        kindLabel="emisora(s)"
        formats={STATION_FORMATS}
        onExport={handleExportStations}
        allowDirectory={false}
      />
      <ImportExportDialog
        key={`import-tracks-${importTracksOpen}`}
        open={importTracksOpen}
        onOpenChange={setImportTracksOpen}
        mode="import"
        kindLabel="canciones"
        formats={TRACK_FORMATS}
        onImport={handleImportTracks}
      />

      {/* Editor completo de emisora */}
      <StationEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        stationId={editorStationId}
        mode={editorMode}
      />
    </div>
  );
}

/**
 * Genera un ZIP "STORE" (sin compresión) como Blob. Es una implementación
 * mínima para no añadir una dependencia externa como JSZip.
 *
 * @param files Entradas { name, content } con rutas relativas y contenido UTF-8.
 */
async function buildZipBlob(
  files: { name: string; content: string }[]
): Promise<Blob> {
  // Estructura de un ZIP:
  //   por cada archivo: Local File Header + data
  //   Central Directory: una entrada por archivo
  //   End Of Central Directory Record
  //
  // Sin compresión (método 0 = STORE). CRC-32 calculado manualmente.

  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const dataBytes = enc.encode(file.content);
    const crc = crc32(dataBytes);

    // Local File Header (30 bytes + name)
    const local = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);     // signature
    dv.setUint16(4, 20, true);             // version needed
    dv.setUint16(6, 0, true);              // flags
    dv.setUint16(8, 0, true);              // compression: STORE
    dv.setUint16(10, 0, true);             // mod time
    dv.setUint16(12, 0x21, true);          // mod date (1980-01-01)
    dv.setUint32(14, crc >>> 0, true);     // CRC-32
    dv.setUint32(18, dataBytes.length, true); // compressed size
    dv.setUint32(22, dataBytes.length, true); // uncompressed size
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);             // extra field length
    local.set(nameBytes, 30);
    chunks.push(local, dataBytes);

    // Central Directory entry (46 bytes + name)
    const cd = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(cd.buffer);
    cdv.setUint32(0, 0x02014b50, true);   // signature
    cdv.setUint16(4, 20, true);            // version made by
    cdv.setUint16(6, 20, true);            // version needed
    cdv.setUint16(8, 0, true);            // flags
    cdv.setUint16(10, 0, true);            // compression: STORE
    cdv.setUint16(12, 0, true);            // mod time
    cdv.setUint16(14, 0x21, true);        // mod date
    cdv.setUint32(16, crc >>> 0, true);   // CRC-32
    cdv.setUint32(20, dataBytes.length, true);
    cdv.setUint32(24, dataBytes.length, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint16(30, 0, true);           // extra
    cdv.setUint16(32, 0, true);           // comment
    cdv.setUint16(34, 0, true);           // disk number
    cdv.setUint16(36, 0, true);           // internal attrs
    cdv.setUint32(38, 0, true);           // external attrs
    cdv.setUint32(42, offset, true);      // offset of local header
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += local.length + dataBytes.length;
  }

  const centralSize = central.reduce((a, b) => a + b.length, 0);
  const centralOffset = offset;

  // End Of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(4, 0, true);              // disk number
  edv.setUint16(6, 0, true);              // disk with central dir
  edv.setUint16(8, files.length, true);   // entries on this disk
  edv.setUint16(10, files.length, true);  // total entries
  edv.setUint32(12, centralSize, true);
  edv.setUint32(16, centralOffset, true);
  edv.setUint16(20, 0, true);             // comment length

  // Concatenar todo
  return new Blob([...chunks, ...central, eocd], { type: "application/zip" });
}

/** CRC-32 (tabla IEEE). Implementación estándar sin dependencias. */
const CRC_TABLE = (() => {
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
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Como buildZipBlob pero acepta tanto texto (string) como binarios (Uint8Array).
 * Necesario para empaquetar MP3 reales junto con M3U8/JSON de texto.
 *
 * @param files Entradas { name, content } donde content puede ser string o Uint8Array.
 */
async function buildZipBlobWithBinary(
  files: { name: string; content: string | Uint8Array }[]
): Promise<Blob> {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const dataBytes =
      typeof file.content === "string"
        ? enc.encode(file.content)
        : file.content;
    const crc = crc32(dataBytes);

    // Local File Header (30 bytes + name)
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

    // Central Directory entry (46 bytes + name)
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

