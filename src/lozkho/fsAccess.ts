"use client";

/**
 * fsAccess.ts — Utilidades para File System Access API (Chromium / WebView2).
 *
 * Permite que en PC (web/Tauri WebView) el usuario ELIJA un directorio real
 * para importar y exportar archivos. En Android WebView o navegadores sin
 * soporte, se hace fallback al <input type=file webkitdirectory> tradicional.
 *
 * Detección de soporte:
 *   - typeof window.showDirectoryPicker === "function"
 *   - typeof window.showSaveFilePicker === "function"
 *
 * Notas de seguridad:
 *   - El handle devuelto por showDirectoryPicker() puede ser persistido en
 *     IndexedDB (con permiso) para no volver a pedir el directorio en cada
 *     sesión. Por ahora lo usamos efímeramente (no persistimos).
 *   - En Tauri (WebView2) funciona igual que en Chrome desktop.
 *   - En el WebView de Android (System WebView) la API NO está disponible,
 *     por eso el fallback al input sigue siendo necesario.
 */

import type { ImportedFile } from "./useFileImport";

/** Tipo mínimo de FileSystemDirectoryHandle para no depender de lib.dom. */
export interface FsDirHandle {
  name: string;
  getFileHandle: (
    name: string,
    opts?: { create?: boolean }
  ) => Promise<FsFileHandle>;
  values: () => AsyncIterable<FsEntryHandle>;
  requestPermission: (opts: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  queryPermission: (opts: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
}

export interface FsFileHandle {
  name: string;
  getFile: () => Promise<File>;
  createWritable: () => Promise<FsWritableStream>;
}

export interface FsEntryHandle {
  kind: "file" | "directory";
  name: string;
}

export interface FsWritableStream {
  write: (data: string | BufferSource | Blob) => Promise<void>;
  close: () => Promise<void>;
}

/** Comprueba si el navegador soporta File System Access API. */
export function hasFsAccess(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof (window as any).showDirectoryPicker === "function" ||
    typeof (window as any).showSaveFilePicker === "function"
  );
}

/** Comprueba si está disponible showDirectoryPicker (selector de carpeta). */
export function canPickDirectory(): boolean {
  if (typeof window === "undefined") return false;
  return typeof (window as any).showDirectoryPicker === "function";
}

/** Comprueba si está disponible showSaveFilePicker (guardar un único archivo). */
export function canSaveFile(): boolean {
  if (typeof window === "undefined") return false;
  return typeof (window as any).showSaveFilePicker === "function";
}

/**
 * Abre el selector de directorio. Devuelve el handle o null si el usuario
 * cancela o el navegador no soporta la API.
 */
export async function pickDirectory(): Promise<FsDirHandle | null> {
  if (!canPickDirectory()) return null;
  try {
    const handle = await (window as any).showDirectoryPicker({
      mode: "readwrite",
      id: "lozkho-stereo-export",
    });
    return handle as FsDirHandle;
  } catch (err: any) {
    // AbortError = el usuario canceló. No es un error real.
    if (err?.name === "AbortError") return null;
    console.warn("fsAccess.pickDirectory:", err);
    return null;
  }
}

/**
 * Abre el selector de directorio para LECTURA (importar).
 * Devuelve el handle o null si no se pudo.
 */
export async function pickDirectoryForRead(): Promise<FsDirHandle | null> {
  if (!canPickDirectory()) return null;
  try {
    const handle = await (window as any).showDirectoryPicker({
      mode: "read",
      id: "lozkho-stereo-import",
    });
    return handle as FsDirHandle;
  } catch (err: any) {
    if (err?.name === "AbortError") return null;
    console.warn("fsAccess.pickDirectoryForRead:", err);
    return null;
  }
}

/**
 * Lee recursivamente TODOS los archivos dentro de un directorio (y subdirectorios).
 * Devuelve un array de ImportedFile compatible con el hook useFileImport,
 * con relativePath preservando la estructura de carpetas.
 *
 * @param accept Extensions or MIME filter, e.g. "audio/*,.mp3,.m4a".
 *              Si se omite, acepta todo.
 *
 * IMPORTANTE: Además de los archivos que coincidan con `accept`, SIEMPRE se
 * incluyen los archivos de audio (mp3, m4a, flac, etc.) y los archivos de
 * texto/playlist (.lrc, .m3u8, .m3u, .json, .txt). Esto es crucial para que,
 * al importar un directorio de emisoras, los MP3 de subcarpetas (audio/)
 * estén disponibles para asociarlos con las pistas referenciadas en el M3U8.
 */
export async function readAllFilesFromDir(
  dirHandle: FsDirHandle,
  accept?: string
): Promise<ImportedFile[]> {
  const accepted = parseAccept(accept);
  const out: ImportedFile[] = [];

  async function walk(handle: FsDirHandle, prefix: string) {
    for await (const entry of handle.values()) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === "directory") {
        const sub = await (handle as any).getDirectoryHandle(entry.name);
        await walk(sub as FsDirHandle, path);
      } else if (entry.kind === "file") {
        // Aceptar si coincide con el filtro `accept` O si es un archivo de
        // audio (siempre incluido para poder asociarlo a M3U8/JSON).
        const includeByAccept = isAccepted(entry.name, accepted);
        const includeByExtension = isAlwaysIncluded(entry.name);
        if (!includeByAccept && !includeByExtension) continue;
        const fileHandle = await handle.getFileHandle(entry.name);
        const file = await fileHandle.getFile();
        out.push({
          name: file.name,
          size: file.size,
          type: file.type || "application/octet-stream",
          relativePath: path,
          file,
        });
      }
    }
  }

  await walk(dirHandle, "");
  return out;
}

/**
 * Comprueba si un archivo SIEMPRE debe ser incluido al leer un directorio,
 * independientemente del filtro `accept`. Esto incluye todos los formatos
 * de audio soportados por la app, las listas de reproducción, y los
 * sidecars JSON.
 */
function isAlwaysIncluded(filename: string): boolean {
  const lower = filename.toLowerCase();
  // Audio (todos los formatos soportados)
  if (/\.(mp3|m4a|aac|flac|ogg|opus|wav|wma|alac|aiff)$/i.test(lower)) return true;
  // Listas de reproducción y sidecars
  if (/\.(m3u8|m3u|json|lrc|txt|zip)$/i.test(lower)) return true;
  // Imágenes (thumbnails de emisoras)
  if (/\.(png|jpg|jpeg|webp|gif|bmp|svg)$/i.test(lower)) return true;
  return false;
}

/**
 * Escribe un archivo dentro de un directorio. Sobrescribe si existe.
 * Devuelve el path relativo del archivo creado.
 */
export async function writeFileToDir(
  dirHandle: FsDirHandle,
  name: string,
  content: string | Blob | BufferSource
): Promise<string> {
  const fileHandle = await dirHandle.getFileHandle(name, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  return name;
}

/**
 * Crea un subdirectorio dentro del handle dado (recursivamente si el nombre
 * contiene "/"). Devuelve el handle del subdirectorio.
 */
export async function ensureSubdir(
  root: FsDirHandle,
  path: string
): Promise<FsDirHandle> {
  const parts = path.split("/").filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = await (current as any).getDirectoryHandle(part, { create: true });
  }
  return current;
}

/**
 * Abre un diálogo "Guardar como..." para un único archivo. Devuelve el handle
 * o null si el usuario cancela.
 */
export async function pickSaveFile(
  suggestedName: string,
  types: { description?: string; accept: Record<string, string[]> }[]
): Promise<FsFileHandle | null> {
  if (!canSaveFile()) return null;
  try {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName,
      types,
      id: "lozkho-stereo-save",
    });
    return handle as FsFileHandle;
  } catch (err: any) {
    if (err?.name === "AbortError") return null;
    console.warn("fsAccess.pickSaveFile:", err);
    return null;
  }
}

/**
 * Escribe contenido en un FsFileHandle ya obtenido (de pickSaveFile o de
 * getFileHandle sobre un directorio).
 */
export async function writeToFileHandle(
  handle: FsFileHandle,
  content: string | Blob | BufferSource
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

/**
 * Dispara una descarga "tradicional" del navegador (fallback cuando no hay
 * File System Access API). Crea un <a download> temporal.
 */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * Dispara una descarga tradicional a partir de texto (más cómodo para
 * M3U8/JSON/LRC).
 */
export function downloadText(
  filename: string,
  text: string,
  mime = "text/plain"
): void {
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}

// ----------------------------- helpers internos -----------------------------

function parseAccept(accept?: string): { exts: string[]; mimes: string[] } {
  if (!accept) return { exts: [], mimes: [] };
  const parts = accept.split(",").map((s) => s.trim()).filter(Boolean);
  const exts: string[] = [];
  const mimes: string[] = [];
  for (const p of parts) {
    if (p.startsWith(".")) exts.push(p.toLowerCase());
    else mimes.push(p.toLowerCase());
  }
  return { exts, mimes };
}

function isAccepted(
  filename: string,
  accepted: { exts: string[]; mimes: string[] }
): boolean {
  if (accepted.exts.length === 0 && accepted.mimes.length === 0) return true;
  const lower = filename.toLowerCase();
  for (const ext of accepted.exts) {
    if (lower.endsWith(ext)) return true;
  }
  // No podemos determinar el MIME solo por nombre; aceptar si hay wildcards
  for (const mime of accepted.mimes) {
    if (mime === "*/*") return true;
    if (mime.endsWith("/*")) {
      // Acepta por extensión de audio si era audio/*
      if (mime.startsWith("audio/")) {
        if (/\.(mp3|m4a|aac|flac|ogg|opus|wav|wma)$/i.test(lower)) return true;
      }
      if (mime.startsWith("text/")) {
        if (/\.(txt|lrc|json|m3u8|m3u|csv)$/i.test(lower)) return true;
      }
    }
  }
  return false;
}
