// Tipos centrales del prototipo Lozkho Stereo.
// Estos tipos representan el modelo de datos que la app nativa deberá persistir.

export type Band = "FM" | "AM";

/**
 * Fuentes tipográficas disponibles para el título/nombre de la emisora.
 * En el prototipo se cargan desde Google Fonts; en la app nativa se
 * empaquetarán como assets del bundle (sin dependencia de red).
 */
export type FontKey =
  | "geist"      // Geist Sans (default, sans humanista)
  | "playfair"  // Playfair Display (serif editorial)
  | "bebas"     // Bebas Neue (condensada display)
  | "oswald"    // Oswald (condensada sans)
  | "caveat"    // Caveat (manuscrita)
  | "jetmono"   // JetBrains Mono (mono)
  | "anton"     // Anton (display extrabold)
  | "lora";     // Lora (serif legible)

export interface StationColor {
  /** Color principal de acento de la emisora (HEX). */
  accent: string;
  /** Color secundario para gradientes y glow. */
  accent2: string;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  /** Año de la canción (para ordenamiento). */
  year?: number;
  /** Duración en milisegundos. */
  durationMs: number;
  /** Referencia a letras sincronizadas (LRC). Puede ser null si no hay. */
  lyricsId?: string;
  /** Ruta o URI del archivo local (en la app nativa sería un content:// o file://). */
  sourceUri: string;
  /** Origen / licencia (informativo). */
  license?: string;
}

export interface Ad {
  id: string;
  title: string;
  sponsor?: string;
  durationMs: number;
  sourceUri: string;
  license?: string;
}

export interface StationLyrics {
  id: string;
  /** Coincidencia por título, artista o nombre de archivo. */
  matchKey: string;
  title: string;
  artist?: string;
  /** Origen: "local" | "online:lrclib" | etc. */
  source: "local" | "online";
  /** Cabeceras LRC estándar (offset 0 si no se indica). */
  offsetMs?: number;
  /** Líneas sincronizadas en formato [mm:ss.xx] texto. */
  lines: { timeMs: number; text: string }[];
  /** Licencia del contenido de las letras cuando aplica. */
  license?: string;
}

export interface StationPlaybackState {
  /** Índice actual en el playlist (pista o anuncio). */
  currentItemIndex: number;
  /** Posición dentro del ítem actual en ms. */
  positionMs: number;
  /** Marca de tiempo del último avance (Date.now()). */
  lastTickAt: number;
  /** Si el reloj virtual de esta emisora avanza (true) o está pausado (false). */
  running: boolean;
  /** Si actualmente está sonando un anuncio (true) o música (false). */
  isAd: boolean;
}

export interface Station {
  id: string;
  name: string;
  /** Fuente tipográfica del título/nombre de la emisora. */
  titleFont: FontKey;
  /** Color del título/nombre de la emisora (HEX). Si es null, usa el acento. */
  titleColor: string | null;
  /** Imagen de miniatura importada por el usuario (data URI o ruta). Si es null, usa gradiente. */
  thumbnailUri: string | null;
  band: Band;
  frequency: string; // p. ej. "101.5" o "680"
  mood: string;      // etiqueta de estado de ánimo
  slogan: string;    // eslogan / leyenda / subtítulo
  colors: StationColor;
  /** URL de miniatura (data URI, asset local, o gradient). Mantenido por compat; thumbnailUri tiene prioridad. */
  thumbnail: string;
  playlist: Track[];
  ads: Ad[];
  /** Inserta un anuncio cada N pistas (programación simple). */
  adEvery: number;
  /** Orden de reproducción de las pistas. */
  playOrder: PlayOrder;
  playback: StationPlaybackState;
}

export type PlayOrder =
  | "import"     // Orden de importación (default)
  | "alpha"      // Orden alfabético por título
  | "year"       // Por año (campo year del track, si existe)
  | "random"     // Aleatorio (shuffle)
  | "artist";    // Por artista

export type ProtoView =
  | "emisora"
  | "emisoras"
  | "letras";

export type LyricsMode = "normal" | "karaoke";

export interface SettingsPanelState {
  open: boolean;
}

export interface ToastMsg {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "destructive";
}
