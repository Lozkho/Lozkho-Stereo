"use client";

/**
 * stationImport.ts — Parseadores de formatos de importación de emisoras.
 *
 * Formatos soportados:
 *   - M3U8 (UTF-8) / M3U (Latin-1 o UTF-8)
 *   - JSON sidecar (metadatos de una emisora)
 *   - JSON array (múltiples emisoras)
 *   - ZIP (que contenga M3U8 + JSON por emisora)
 *
 * Resolución de rutas:
 *   - Si el sourceUri en el M3U8 es una ruta relativa ("canciones/foo.mp3"),
 *     se resuelve a una ruta absoluta basándose en el directorio del M3U8
 *     o, mejor, en los archivos físicos importados junto con el M3U8.
 *   - Si el sourceUri es `content://...` o `http(s)://`, se deja intacto.
 *   - Si se está importando un directorio (carpeta nativa), y existe un
 *     archivo cuyo `relativePath` coincide con la URI del M3U8, se asocia
 *     el File real a ese track y se crea un blob: URL reproducible.
 */

import type { Station, Track, Ad } from "./types";
import type { ImportedFile } from "./useFileImport";
import { audioStore } from "./audioStore";
import { lozkhoLog } from "./logger";

/** Estación intermedia antes de asignar ID y playback. */
export interface ParsedStation {
  name: string;
  band?: "FM" | "AM";
  frequency?: string;
  mood?: string;
  slogan?: string;
  colors?: { accent: string; accent2: string };
  titleFont?: string;
  titleColor?: string | null;
  thumbnailUri?: string | null;
  thumbnail?: string;
  adEvery?: number;
  playOrder?: "import" | "alpha" | "year" | "random" | "artist";
  playlist: Array<Omit<Track, "id">>;
  ads?: Array<Omit<Ad, "id">>;
}

export interface StationImportResult {
  /** Emisoras parseadas listas para añadir al store. */
  stations: ParsedStation[];
  /** Errores encontrados. */
  errors: string[];
  /** Archivos de audio físicos detectados (solo si se importó un directorio). */
  audioFiles: ImportedFile[];
}

/**
 * Lee un archivo .m3u8 o .m3u y devuelve un ParsedStation.
 * Soporta:
 *   - Cabeceras #EXTM3U, #EXTENC, #PLAYLIST, #EXTGENRE
 *   - #EXTINF:duración,artista - título
 *   - Rutas relativas y absolutas
 */
export function parseM3U8(
  text: string,
  filename: string
): ParsedStation | null {
  const lines = text.split(/\r?\n/);
  const tracks: Array<Omit<Track, "id">> = [];
  let name = filename.replace(/\.[^.]+$/, "");
  let mood = "Importado";

  let pendingExtInf: { duration: number; artist: string; title: string } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith("#PLAYLIST:")) {
      name = line.substring("#PLAYLIST:".length).trim() || name;
      continue;
    }
    if (line.startsWith("#EXTGENRE:")) {
      mood = line.substring("#EXTGENRE:".length).trim() || mood;
      continue;
    }
    if (line.startsWith("#EXTINF:")) {
      // #EXTINF:70,Lozkho Demo - Síntesis Nocturna
      const rest = line.substring("#EXTINF:".length);
      const commaIdx = rest.indexOf(",");
      if (commaIdx < 0) continue;
      const durationStr = rest.substring(0, commaIdx);
      const label = rest.substring(commaIdx + 1).trim();
      const duration = parseInt(durationStr, 10) || 0;
      // Separar "artista - título"
      let artist = "Importado";
      let title = label;
      const dashIdx = label.indexOf(" - ");
      if (dashIdx > 0) {
        artist = label.substring(0, dashIdx).trim();
        title = label.substring(dashIdx + 3).trim();
      }
      pendingExtInf = { duration, artist, title };
      continue;
    }
    if (line.startsWith("#")) {
      // Otras directivas: #EXTENC, #EXTALB, etc. Ignorar.
      continue;
    }

    // Es una URI/ruta
    const sourceUri = line;
    const title = pendingExtInf?.title
      ?? sourceUri.split("/").pop()?.replace(/\.[^.]+$/, "")
      ?? `Pista ${tracks.length + 1}`;
    const artist = pendingExtInf?.artist ?? "Importado";
    // Si el M3U8 tiene #EXTINF:0 (o no tiene EXTINF), usar 30s como
    // duración mínima. Sin esto, el reloj virtual de la app ciclaría
    // indefinidamente por todas las pistas (cada tick salta a la siguiente
    // porque positionMs >= 0 siempre es true). El reproductor real
    // sobrescribe la posición cuando onTimeUpdate dispara.
    // Si EXTINF es -1 (desconocida, exportada por prepareStationForExport
    // cuando no se pudo resolver la duración real), también usar 30s.
    const parsedDurationSec = pendingExtInf?.duration ?? 0;
    const durationMs =
      parsedDurationSec > 0 ? parsedDurationSec * 1000 : 30_000;

    tracks.push({
      title,
      artist,
      durationMs,
      sourceUri,
      license: "Importado vía M3U8",
    });
    pendingExtInf = null;
  }

  if (tracks.length === 0) return null;

  return {
    name,
    band: "FM",
    frequency: "100.0",
    mood,
    slogan: `Importada desde ${filename}`,
    colors: { accent: "#F59E0B", accent2: "#7C2D12" },
    adEvery: 2,
    playOrder: "import",
    playlist: tracks,
    ads: [],
  };
}

/**
 * Lee un JSON sidecar de emisora y devuelve el ParsedStation.
 * Soporta un objeto único o un array de emisoras.
 */
export function parseStationJson(text: string): ParsedStation[] {
  const parsed = JSON.parse(text);
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const out: ParsedStation[] = [];
  for (const st of arr) {
    if (!st || typeof st !== "object") continue;
    if (!st.name || !Array.isArray(st.playlist)) continue;
    // Copiar playlist sin id (se generará nuevo)
    const playlist = st.playlist.map((t: any) => ({
      title: t.title ?? "Sin título",
      artist: t.artist ?? "Importado",
      album: t.album,
      genre: t.genre,
      year: t.year,
      // Si durationMs falta o es 0, usar 30s como mínimo para que el
      // reloj virtual no cicla indefinidamente (ver fix en store.ts tickClock).
      durationMs:
        typeof t.durationMs === "number" && t.durationMs > 0
          ? t.durationMs
          : 30_000,
      lyricsId: t.lyricsId,
      sourceUri: t.sourceUri ?? "",
      license: t.license ?? "Importado vía JSON",
    }));
    const ads = Array.isArray(st.ads)
      ? st.ads.map((a: any) => ({
          title: a.title ?? "Anuncio",
          sponsor: a.sponsor,
          durationMs: a.durationMs ?? 0,
          sourceUri: a.sourceUri ?? "",
          license: a.license,
        }))
      : [];
    out.push({
      name: st.name,
      band: st.band ?? "FM",
      frequency: st.frequency ?? "100.0",
      mood: st.mood ?? "Importado",
      slogan: st.slogan ?? "",
      colors: st.colors ?? { accent: "#F59E0B", accent2: "#7C2D12" },
      titleFont: st.titleFont,
      titleColor: st.titleColor,
      thumbnailUri: st.thumbnailUri,
      thumbnail: st.thumbnail,
      adEvery: st.adEvery ?? 2,
      playOrder: st.playOrder ?? "import",
      playlist,
      ads,
    });
  }
  return out;
}

/**
 * Descomprime un ZIP (sin compresión, STORE) en memoria.
 * Devuelve un mapa { rutaRelativa -> contenido (string o Uint8Array) }.
 *
 * Implementación mínima: lee Local File Headers y sigue los offsets
 * del Central Directory. Soporta método 0 (STORE) y método 8 (DEFLATE).
 */
export async function unzipBlob(blob: Blob): Promise<
  Map<string, { text?: string; bytes?: Uint8Array }>
> {
  const buffer = await blob.arrayBuffer();
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const result = new Map<string, { text?: string; bytes?: Uint8Array }>();

  // Buscar End Of Central Directory Record (EOCD) desde el final
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error("ZIP inválido: EOCD no encontrado");
  }

  const entries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  // Recorrer entradas del Central Directory
  let cdPtr = cdOffset;
  for (let i = 0; i < entries; i++) {
    if (view.getUint32(cdPtr, true) !== 0x02014b50) {
      throw new Error(`ZIP inválido: entrada ${i} del CD mal formada`);
    }
    const method = view.getUint16(cdPtr + 10, true);
    const compressedSize = view.getUint32(cdPtr + 20, true);
    const uncompressedSize = view.getUint32(cdPtr + 24, true);
    const nameLen = view.getUint16(cdPtr + 28, true);
    const extraLen = view.getUint16(cdPtr + 30, true);
    const commentLen = view.getUint16(cdPtr + 32, true);
    const localHeaderOffset = view.getUint32(cdPtr + 42, true);
    const name = new TextDecoder().decode(
      bytes.subarray(cdPtr + 46, cdPtr + 46 + nameLen)
    );

    // Saltar al siguiente CD entry
    cdPtr += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith("/")) continue; // directorio

    // Leer Local File Header para encontrar el data offset
    const localNameLen = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataOffset + compressedSize;
    const compressed = bytes.subarray(dataOffset, dataEnd);

    let content: Uint8Array;
    if (method === 0) {
      // STORE
      content = compressed;
    } else if (method === 8) {
      // DEFLATE
      // Browser-native decompression via DecompressionStream
      const ds = new DecompressionStream("deflate-raw");
      const blob = new Blob([compressed]);
      const stream = blob.stream().pipeThrough(ds);
      const decompressed = await new Response(stream).arrayBuffer();
      content = new Uint8Array(decompressed);
    } else {
      throw new Error(`Método de compresión ZIP no soportado: ${method}`);
    }

    if (uncompressedSize > 0 && content.length === 0) {
      // Empty content
    }
    // Detectar si es texto (usamos UTF-8 si los primeros bytes no son NULL)
    const isBinary = content.length > 0 && content.some((b, idx) => b === 0 && idx < 1024);
    if (isBinary) {
      result.set(name, { bytes: content });
    } else {
      const text = new TextDecoder().decode(content);
      result.set(name, { text });
    }
  }

  return result;
}

/**
 * Lee un ZIP completo y devuelve las emisoras encontradas.
 *
 * Estructura esperada del ZIP:
 *   <slug-emisora>/station.m3u8
 *   <slug-emisora>/station.json
 *   o
 *   <slug-emisora>.m3u8
 *   <slug-emisora>.json
 */
export async function parseZip(
  zipBlob: Blob
): Promise<{ stations: ParsedStation[]; errors: string[] }> {
  const errors: string[] = [];
  const stations: ParsedStation[] = [];
  const entries = await unzipBlob(zipBlob);

  // Agrupar entradas por "carpeta de emisora" (el primer componente de la ruta)
  // o por slug si están sueltas en la raíz.
  const byStation = new Map<
    string,
    { m3u8?: string; json?: string; name?: string }
  >();

  for (const [path, content] of entries.entries()) {
    const parts = path.split("/");
    if (parts.length === 0) continue;
    const fileBaseName = parts[parts.length - 1];
    const stationKey =
      parts.length > 1 ? parts.slice(0, -1).join("/") : fileBaseName.replace(/\.[^.]+$/, "");

    if (!byStation.has(stationKey)) {
      byStation.set(stationKey, {});
    }
    const entry = byStation.get(stationKey)!;

    if (fileBaseName.toLowerCase().endsWith(".m3u8") && content.text) {
      entry.m3u8 = content.text;
    } else if (fileBaseName.toLowerCase().endsWith(".m3u") && content.text) {
      entry.m3u8 = content.text;
    } else if (fileBaseName.toLowerCase().endsWith(".json") && content.text) {
      entry.json = content.text;
    }
  }

  for (const [key, entry] of byStation.entries()) {
    try {
      let station: ParsedStation | null = null;
      if (entry.json) {
        const parsed = parseStationJson(entry.json);
        if (parsed.length > 0) station = parsed[0];
      }
      if (!station && entry.m3u8) {
        station = parseM3U8(entry.m3u8, `${key}.m3u8`);
      }
      if (station) {
        stations.push(station);
      } else {
        errors.push(`No se pudo parsear la emisora en "${key}"`);
      }
    } catch (err) {
      errors.push(`Error en "${key}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { stations, errors };
}

/**
 * Toma un ParsedStation y sus posibles archivos de audio físicos
 * (cuando se importó un directorio junto con el M3U8), y para cada
 * track:
 *   - Si su sourceUri apunta a un archivo que existe en `audioFiles`,
 *     asocia el File real y guarda el blob en IndexedDB para crear
 *     un blob: URL reproducible.
 *   - Si no, deja el sourceUri como está (puede ser una URI
 *     http(s):// o content:// remota).
 *
 * Devuelve una nueva lista de tracks con sourceUri posiblemente
 * reescrito a un blob: URL reproducible en el navegador actual.
 *
 * Estrategia de matching (en orden, primer match gana):
 *   1. Coincidencia exacta de relativePath (case-insensitive).
 *   2. Coincidencia por sufijo de relativePath: si el M3U8 dice
 *      `./audio/Pista_1.mp3` y el relativePath real es
 *      `Lozkho_FM/audio/Pista_1.mp3`, el sufijo `audio/Pista_1.mp3`
 *      coincide. Esto es CRÍTICO porque el navegador antepone el
 *      nombre del directorio raíz al relativePath, pero el M3U8
 *      solo tiene la ruta relativa al directorio de la emisora.
 *   3. Coincidencia por nombre de archivo (basename).
 *   4. Coincidencia por título del track vs nombre de archivo
 *      (sin extensión).
 */
export async function resolveTracksWithAudioFiles(
  station: ParsedStation,
  audioFiles: ImportedFile[]
): Promise<ParsedStation> {
  if (audioFiles.length === 0) return station;

  // Construir índices:
  //   byRelativePathLower: "Lozkho_FM/audio/Pista_1.mp3" → file
  //   byPathSuffixLower:   "audio/Pista_1.mp3" → file  (sufijo)
  //   byBaseNameLower:     "Pista_1.mp3" → file
  //   byBaseNameNoExtLower:"pista_1" → file
  const byRelativePathLower = new Map<string, ImportedFile>();
  const byPathSuffixLower = new Map<string, ImportedFile>();
  const byBaseNameLower = new Map<string, ImportedFile>();
  const byBaseNameNoExtLower = new Map<string, ImportedFile>();

  for (const f of audioFiles) {
    const rp = (f.relativePath ?? f.name).toLowerCase();
    byRelativePathLower.set(rp, f);

    // Sufijo: para "Lozkho_FM/audio/Pista_1.mp3" indexar también como
    // "audio/Pista_1.mp3", "Pista_1.mp3". Esto permite que el M3U8 con
    // "./audio/Pista_1.mp3" encuentre el archivo aunque el navegador
    // haya antepuesto el nombre del directorio raíz.
    const parts = rp.split("/");
    for (let i = Math.max(0, parts.length - 4); i < parts.length - 1; i++) {
      const suffix = parts.slice(i).join("/");
      if (suffix && !byPathSuffixLower.has(suffix)) {
        byPathSuffixLower.set(suffix, f);
      }
    }

    const baseName = parts[parts.length - 1]!;
    byBaseNameLower.set(baseName, f);

    const dotIdx = baseName.lastIndexOf(".");
    const baseNoExt = dotIdx > 0 ? baseName.substring(0, dotIdx) : baseName;
    if (!byBaseNameNoExtLower.has(baseNoExt)) {
      byBaseNameNoExtLower.set(baseNoExt, f);
    }
  }

  const newPlaylist: Array<Omit<Track, "id">> = [];
  for (const track of station.playlist) {
    let matched: ImportedFile | undefined;
    const uri = track.sourceUri ?? "";

    // 0) Si la URI es blob: o http(s):// o content:// — ya es reproducible
    //    o remota, no necesita resolución.
    if (/^(blob:|https?:|content:)/i.test(uri)) {
      newPlaylist.push(track);
      continue;
    }

    // 1) Coincidencia exacta de relativePath (limpiando "./" inicial)
    if (uri) {
      const cleanUri = uri.replace(/^\.\//, "").toLowerCase();
      matched = byRelativePathLower.get(cleanUri);
    }

    // 2) Coincidencia por sufijo de relativePath
    //    M3U8 dice "./audio/Pista_1.mp3" → buscar "audio/Pista_1.mp3"
    if (!matched && uri) {
      const cleanUri = uri.replace(/^\.\//, "").toLowerCase();
      // Por cada forma posible de coger un sufijo de la URI, mirar en
      // byPathSuffixLower. Como ya indexamos sufijos de 1 a 4 componentes,
      // esto debería encontrar la mayoría.
      const parts = cleanUri.split("/");
      for (let i = 0; i < parts.length; i++) {
        const suffix = parts.slice(i).join("/");
        if (suffix && byPathSuffixLower.has(suffix)) {
          matched = byPathSuffixLower.get(suffix);
          break;
        }
      }
    }

    // 3) Coincidencia por nombre de archivo (basename)
    if (!matched && uri) {
      const baseName = uri.split("/").pop()!.split("?")[0]!.toLowerCase();
      matched = byBaseNameLower.get(baseName);
    }

    // 4) Coincidencia por título del track vs nombre de archivo (sin ext)
    if (!matched && track.title) {
      const titleLower = track.title
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      matched = byBaseNameNoExtLower.get(titleLower);
      if (!matched) {
        // Búsqueda lineal por si hay variaciones de acentos
        for (const [name, file] of byBaseNameNoExtLower.entries()) {
          const normalized = name
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
          if (normalized === titleLower) {
            matched = file;
            break;
          }
        }
      }
    }

    if (matched) {
      // IMPORTANTE: usar el track.id como key en IndexedDB para que
      // `restoreAllUrls` (que busca por track.id) pueda encontrarlo tras
      // recargar la página. Si el track no tiene id todavía, generar uno
      // aquí mismo y devolverlo en el track para que StationsListView lo
      // preserve al reasignar ids.
      const trackId =
        (track as any).id ?? `trk-imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const blobUrl = await audioStore.saveFile(trackId, matched.file);
      lozkhoLog.debug(
        `Import: audio guardado en IndexedDB para "${track.title}"`,
        { key: trackId, file: matched.name, size: matched.file.size }
      );
      newPlaylist.push({
        ...track,
        id: trackId,
        sourceUri: blobUrl,
        license: (track.license ?? "Importado") + " · audio real asociado",
      });
    } else {
      // No se encontró audio real: dejar la URI original (relativa o vacía).
      // El reproductor ignorará silenciosamente pistas no reproducibles.
      lozkhoLog.warn(
        `Import: sin audio encontrado para "${track.title}"`,
        { uri }
      );
      newPlaylist.push({
        ...track,
        // Marcar para que el reproductor sepa que no es reproducible
        sourceUri: uri || "demo:no-audio",
      });
    }
  }

  return { ...station, playlist: newPlaylist };
}
