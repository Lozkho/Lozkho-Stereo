import type { FontKey } from "./types";

/**
 * Catálogo de fuentes tipográficas disponibles para el título de la emisora.
 *
 * Las fuentes se cargan mediante <link> a Google Fonts CDN en src/app/layout.tsx.
 * En la app nativa (Flutter) se empaquetarán como archivos .ttf en
 * `assets/fonts/` y se registrarán en `pubspec.yaml`.
 */
export interface FontDefinition {
  key: FontKey;
  label: string;
  /** Familia CSS que aplica esta fuente. */
  cssFamily: string;
  /** Descripción breve para el usuario. */
  description: string;
  /** Categoría para agrupar en el selector. */
  category: "sans" | "serif" | "display" | "mono" | "handwriting";
  /** Preview rápido: "Lozkho FM" en esta fuente. */
  preview: string;
}

export const FONT_CATALOG: FontDefinition[] = [
  {
    key: "geist",
    label: "Geist Sans",
    cssFamily: "'Geist', sans-serif",
    description: "Sans humanista moderna. Limpia y legible. Por defecto.",
    category: "sans",
    preview: "Lozkho FM",
  },
  {
    key: "playfair",
    label: "Playfair Display",
    cssFamily: "'Playfair Display', serif",
    description: "Serif editorial. Elegante y con personalidad.",
    category: "serif",
    preview: "Lozkho FM",
  },
  {
    key: "bebas",
    label: "Bebas Neue",
    cssFamily: "'Bebas Neue', sans-serif",
    description: "Condensada mayúsculas. Tipo cartel de radio.",
    category: "display",
    preview: "LOZKHO FM",
  },
  {
    key: "oswald",
    label: "Oswald",
    cssFamily: "'Oswald', sans-serif",
    description: "Condensada sans. Estilo periódico o marquesina.",
    category: "sans",
    preview: "Lozkho FM",
  },
  {
    key: "caveat",
    label: "Caveat",
    cssFamily: "'Caveat', cursive",
    description: "Manuscrita. Casual y cercana.",
    category: "handwriting",
    preview: "Lozkho FM",
  },
  {
    key: "jetmono",
    label: "JetBrains Mono",
    cssFamily: "'JetBrains Mono', monospace",
    description: "Monoespaciada. Estilo receptor digital o código.",
    category: "mono",
    preview: "Lozkho FM",
  },
  {
    key: "anton",
    label: "Anton",
    cssFamily: "'Anton', sans-serif",
    description: "Display extrabold condensada. Impacto máximo.",
    category: "display",
    preview: "LOZKHO FM",
  },
  {
    key: "lora",
    label: "Lora",
    cssFamily: "'Lora', serif",
    description: "Serif legible. Cuerpo editorial nocturno.",
    category: "serif",
    preview: "Lozkho FM",
  },
];

/** Devuelve la definición de una fuente por su key. */
export function getFont(key: FontKey): FontDefinition {
  return FONT_CATALOG.find((f) => f.key === key) ?? FONT_CATALOG[0];
}

/** Devuelve la familia CSS a aplicar para un FontKey dado. */
export function getFontFamily(key: FontKey): string {
  return getFont(key).cssFamily;
}
