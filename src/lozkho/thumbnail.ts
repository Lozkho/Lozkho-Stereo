"use client";

/**
 * thumbnail.ts — Guardado unificado de miniaturas de emisora.
 *
 * Problema anterior: había DOS mecanismos incompatibles:
 *   1. SettingsPanel/StationEditor: FileReader.readAsDataURL → data-URL
 *      guardada EN localStorage (via Zustand persist). Una PNG de 500 KB
 *      ocupa ~680 KB en base64 y localStorage tiene una quota de 5-10 MB:
 *      con varias imágenes se dispara QuotaExceededError y el fallback
 *      destructivo del store podía borrar playlists y miniaturas.
 *   2. Import de emisoras (resolveThumbnail): blob guardado en IndexedDB
 *      bajo `thumb-${stationId}` y restaurado al cargar (restoreAllUrls).
 *
 * Solución: UN solo mecanismo para todos los orígenes (el 2):
 *   imagen → reescalar con canvas a máx. 512 px (~50-200 KB) → IndexedDB
 *   (`thumb-${stationId}`) → blob: URL en memoria.
 *
 * El reescalado evita que miniaturas de 4 MB ocupen quota/IndexedDB
 * innecesariamente y acelera el render. Si el reescalado falla (formato
 * exótico, sin canvas), se guarda el blob original como fallback.
 */

import { audioStore } from "./audioStore";

/** Tamaño máximo (px del lado mayor) al reescalar miniaturas. */
export const THUMB_MAX_PX = 512;

/** Clave bajo la que se guarda la miniatura de una emisora en IndexedDB. */
export function thumbKeyFor(stationId: string): string {
  return `thumb-${stationId}`;
}

/**
 * Reescala una imagen a un máximo de `maxPx` en su lado mayor usando canvas.
 * - PNG/GIF/WebP (posible transparencia) se re-codifican como PNG.
 * - JPEG y el resto se re-codifican como JPEG calidad 0.85.
 * - Si la imagen ya es más pequeña que maxPx, se devuelve SIN tocar.
 * - Si algo falla (decodificación, canvas no disponible), devuelve el blob
 *   original: nunca debe romper la importación por culpa de la miniatura.
 */
export async function downscaleImageBlob(
  blob: Blob,
  maxPx: number = THUMB_MAX_PX
): Promise<Blob> {
  if (typeof document === "undefined") return blob; // SSR / sin DOM
  try {
    let source: CanvasImageSource;
    let width = 0;
    let height = 0;
    let cleanup: () => void;

    if (typeof createImageBitmap === "function") {
      const bmp = await createImageBitmap(blob);
      source = bmp;
      width = bmp.width;
      height = bmp.height;
      cleanup = () => {
        try {
          bmp.close();
        } catch {
          /* ignore */
        }
      };
    } else {
      // Fallback para WebViews viejos sin createImageBitmap
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("No se pudo decodificar la imagen"));
        img.src = url;
      });
      source = img;
      width = img.naturalWidth;
      height = img.naturalHeight;
      cleanup = () => URL.revokeObjectURL(url);
    }

    try {
      if (!width || !height) return blob;
      // No reescalar hacia arriba ni re-codificar imágenes ya pequeñas
      if (width <= maxPx && height <= maxPx) return blob;

      const scale = Math.min(maxPx / width, maxPx / height);
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return blob;
      ctx.drawImage(source, 0, 0, w, h);

      const keepAlpha =
        blob.type === "image/png" ||
        blob.type === "image/gif" ||
        blob.type === "image/webp" ||
        blob.type === "image/svg+xml";
      const mime = keepAlpha ? "image/png" : "image/jpeg";

      const out = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, mime, keepAlpha ? undefined : 0.85)
      );
      return out ?? blob;
    } finally {
      cleanup();
    }
  } catch {
    return blob;
  }
}

/**
 * Guarda la miniatura de una emisora: reescala + IndexedDB y devuelve la
 * blob: URL lista para usar en el store (thumbnailUri).
 */
export async function saveStationThumbnail(
  stationId: string,
  source: Blob
): Promise<string> {
  const small = await downscaleImageBlob(source, THUMB_MAX_PX);
  return audioStore.saveFile(thumbKeyFor(stationId), small);
}
