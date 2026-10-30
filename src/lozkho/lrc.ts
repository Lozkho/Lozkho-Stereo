/**
 * Módulo compartido para parsear y serializar letras en formato LRC.
 *
 * Extraído de LyricsManagerView.tsx para poder reutilizarlo desde
 * el editor de letras inline (LyricsEditorDialog) sin duplicar lógica.
 *
 * Formato LRC soportado:
 *   [ti:Título]
 *   [ar:Artista]
 *   [al:Álbum]
 *   [offset:+120]   (ms)
 *   [mm:ss.xx] Línea de letra
 *   [mm:ss.xx][01:30.00] Línea repetida en otro timestamp
 *
 * También soporta LRC mejorado (word-by-word) con <00> timestamps internos
 * — los ignora y solo usa los timestamps de línea.
 */
import type { StationLyrics } from "./types";

/**
 * Genera un ID único para una letra nueva.
 * Formato: lyr-{timestamp}-{random}
 */
export function makeLyricsId(prefix = "lyr"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Parsea texto LRC (o TXT con timestamps) a un objeto StationLyrics.
 *
 * @param text Contenido del archivo LRC/TXT
 * @param defaultTitle Título por defecto si el LRC no incluye cabecera [ti:]
 * @param defaultArtist Artista por defecto si no hay [ar:]
 * @param source Origen: "local" | "online". Default "local".
 * @param license Texto de licencia opcional
 * @returns StationLyrics o null si no hay ninguna línea con timestamp válido
 */
export function parseLRC(
  text: string,
  defaultTitle: string,
  defaultArtist?: string,
  source: "local" | "online" = "local",
  license?: string
): StationLyrics | null {
  const lines = text.split(/\r?\n/);
  const lyricLines: { timeMs: number; text: string }[] = [];
  let title = defaultTitle;
  let artist = defaultArtist;
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
      else if (key === "ar") artist = value || artist;
      else if (key === "offset") {
        const parsed = parseInt(value, 10);
        if (!isNaN(parsed)) offsetMs = parsed;
      }
      continue;
    }

    // Timestamps [mm:ss.xx] al inicio de línea.
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
      const cleanText = remaining.replace(/<\d{2,3}>/g, "").trim();
      for (const ts of timestamps) {
        lyricLines.push({ timeMs: ts + offsetMs, text: cleanText });
      }
    }
  }

  if (lyricLines.length === 0) return null;

  // Ordenar por timeMs ascendente
  lyricLines.sort((a, b) => a.timeMs - b.timeMs);

  return {
    id: makeLyricsId(),
    matchKey: title,
    title,
    artist,
    source,
    offsetMs,
    lines: lyricLines,
    license: license ?? (source === "local" ? "Importado por el usuario" : undefined),
  };
}

/**
 * Serializa un StationLyrics a texto LRC estándar.
 *
 * Incluye cabeceras [ti:], [ar:], [al:] (si offsetMs !== 0) y una línea
 * por cada entrada con timestamp [mm:ss.cc] y texto.
 */
export function buildLRC(l: StationLyrics): string {
  const out: string[] = [];
  out.push(`[ti:${l.title}]`);
  if (l.artist) out.push(`[ar:${l.artist}]`);
  if (l.offsetMs) {
    out.push(`[offset:${l.offsetMs > 0 ? "+" : ""}${l.offsetMs}]`);
  }
  for (const line of l.lines) {
    const mm = Math.floor(line.timeMs / 60000);
    const ss = Math.floor((line.timeMs % 60000) / 1000);
    const cs = Math.floor((line.timeMs % 1000) / 10);
    out.push(
      `[${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(cs).padStart(2, "0")}]${line.text}`
    );
  }
  return out.join("\n") + "\n";
}

/**
 * Serializa un StationLyrics a texto plano (sin timestamps).
 * Útil para vista previa de "letras no sincronizadas".
 */
export function buildTxt(l: StationLyrics): string {
  return l.lines.map((line) => line.text).join("\n") + "\n";
}

/**
 * Normaliza una cadena para comparación de títulos:
 * minúsculas, sin acentos ni espacios ni puntuación.
 *
 * Útil para hacer matching heurístico entre el título de un track y un
 * StationLyrics.matchKey cuando no hay lyricsId directo.
 */
export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}
