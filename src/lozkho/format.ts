// Utilidades de formato compartidas por el prototipo.

/** Convierte milisegundos a "m:ss". */
export function formatClock(ms: number): string {
  if (!isFinite(ms) || ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Convierte ms a "h m min" legible, p. ej. 1 h 12 min 4 s. */
export function formatDurationLong(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return "0 s";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} h`);
  if (m > 0) parts.push(`${m} min`);
  if (s > 0 && h === 0) parts.push(`${s} s`);
  return parts.join(" ") || "0 s";
}

/** Formatea "101.5" o "680" como cadena de frecuencia tipo receptor. */
export function formatFrequency(frequency: string, band: "FM" | "AM"): string {
  const f = frequency.trim();
  if (band === "FM") {
    // Asegura un decimal.
    if (!f.includes(".")) return `${f}.0`;
    return f;
  }
  // AM: número entero sin decimales.
  return f.replace(/\.\d+$/, "");
}

/**
 * Convierte una frecuencia string a número para ordenamiento.
 * AM: entero (ej. "680" → 680).
 * FM: decimal (ej. "101.5" → 101.5).
 * Si no se puede parsear, devuelve 0.
 */
export function parseFrequency(frequency: string): number {
  const n = parseFloat(frequency.trim());
  return isFinite(n) ? n : 0;
}

/**
 * Ordena emisoras: primero AM en orden ascendente, luego FM en orden
 * ascendente. Las emisoras con la misma banda y frecuencia mantienen su
 * orden relativo original (sort estable).
 */
export function sortStationsByBand<T extends { band: "FM" | "AM"; frequency: string }>(
  stations: T[]
): T[] {
  return [...stations].sort((a, b) => {
    // AM primero (0), FM después (1)
    if (a.band !== b.band) {
      return a.band === "AM" ? -1 : 1;
    }
    // Misma banda: ordenar por frecuencia ascendente
    return parseFrequency(a.frequency) - parseFrequency(b.frequency);
  });
}

/** Hex a rgba. */
export function hexToRgba(hex: string, alpha: number = 1): string {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Construye un gradiente CSS para el fondo de la emisora. */
export function buildStationGradient(
  accent: string,
  accent2: string
): string {
  return `radial-gradient(ellipse at 50% -10%, ${hexToRgba(accent, 0.55)} 0%, transparent 55%),
          radial-gradient(ellipse at 100% 100%, ${hexToRgba(accent2, 0.42)} 0%, transparent 55%),
          radial-gradient(ellipse at 0% 100%, ${hexToRgba(accent, 0.18)} 0%, transparent 60%)`;
}

/** Color de texto accesible sobre un fondo con el acento indicado. */
export function readableTextOn(hex: string): "#0a0a0a" | "#fafafa" {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  // luminancia relativa simplificada
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.55 ? "#0a0a0a" : "#fafafa";
}

/** Genera una miniatura "gradiente" como fondo CSS para usar en estilos inline. */
export function gradientThumbnail(accent: string, accent2: string): string {
  return `conic-gradient(from 200deg at 50% 50%, ${accent} 0deg, ${accent2} 180deg, ${accent} 360deg)`;
}

/** Une dos classNames. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
