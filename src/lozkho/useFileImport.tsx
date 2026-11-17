"use client";

import { useCallback, useRef, useState } from "react";
import {
  canPickDirectory,
  pickDirectoryForRead,
  readAllFilesFromDir,
  type FsDirHandle,
} from "./fsAccess";

/**
 * Hook para importar archivos en Lozkho Stereo.
 *
 * Estrategia multi-plataforma:
 *
 *  1. PC (web Chromium / Tauri WebView2): si el navegador soporta
 *     File System Access API, se usa `showDirectoryPicker()` para
 *     abrir un selector de CARPETA REAL. Esto permite al usuario elegir
 *     cualquier directorio del sistema y leer todos sus archivos
 *     recursivamente, con rutas relativas preservadas. El usuario
 *     puede autorizar acceso persistente si lo desea.
 *
 *  2. Android WebView (sin FS Access API): se hace fallback al
 *     `<input type="file" multiple webkitdirectory>` tradicional, que
 *     abre el selector de documentos de Android. Funciona para carpetas
 *     SAF (Storage Access Framework) que el usuario elija.
 *
 *  3. Para archivos individuales (sin directorio): siempre se usa
 *     `<input type="file" multiple>` estándar, soportado en todas las
 *     plataformas.
 *
 * En la app nativa se conservan referencias persistentes:
 *  - Android 10+: SAF con `takePersistableUriPermission` para `content://`
 *  - Windows: rutas absolutas con permiso de carpeta persistente
 */

export interface ImportedFile {
  name: string;
  size: number;
  /** Para directorios: ruta relativa dentro del directorio elegido. */
  relativePath?: string;
  /** MIME detectado por el navegador. */
  type: string;
  /**
   * Archivo nativo del navegador (web/PC, o selector de archivos suelto en
   * Android). No está disponible cuando el archivo llega por streaming SAF.
   */
  file?: File;
  /**
   * URL reproducible por streaming (Android SAF): https://lozkho.local/...,
   * que el MainActivity resuelve contra el content:// URI original elegido
   * por el usuario. Es persistente entre sesiones (se guarda tal cual en
   * localStorage) y NO requiere copiar el audio a IndexedDB.
   */
  contentUrl?: string;
}

/**
 * Convierte un content:// URI de SAF (Android) en una URL reproducible a
 * través del interceptor https://lozkho.local/ del MainActivity.
 *
 * El path es el content URI codificado en Base64 URL-safe (con padding),
 * que MainActivity decodifica con android.util.Base64.URL_SAFE y abre con
 * ContentResolver (con soporte de Range para el seek del <audio>).
 */
export function lozkhoLocalUrl(contentUri: string): string {
  const bytes = new TextEncoder().encode(contentUri);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_");
  return `https://lozkho.local/${b64}`;
}

/**
 * Obtiene el contenido de un archivo importado como Blob, sea de un File
 * nativo (PC/web) o de una URL de streaming lozkho.local (Android SAF).
 */
export async function importedFileBlob(f: ImportedFile): Promise<Blob> {
  if (f.file) return f.file;
  if (f.contentUrl) {
    const res = await fetch(f.contentUrl);
    if (!res.ok) {
      throw new Error(`No se pudo leer "${f.name}" (HTTP ${res.status})`);
    }
    return res.blob();
  }
  throw new Error(`Archivo sin contenido accesible: ${f.name}`);
}

/** Obtiene el contenido de un archivo importado como texto (UTF-8). */
export async function importedFileText(f: ImportedFile): Promise<string> {
  if (f.file) return f.file.text();
  const b = await importedFileBlob(f);
  return b.text();
}

interface UseImportReturn {
  /**
   * Abre el selector de archivos.
   * - `mode: "files"` → archivos individuales (siempre con <input>)
   * - `mode: "directory"` → directorio completo. En PC usa
   *   `showDirectoryPicker()` (FS Access API). En Android/navegadores
   *   sin soporte, hace fallback a `<input webkitdirectory>`.
   */
  pick: (mode: "files" | "directory") => Promise<void>;
  /** Elemento input oculto que debe renderizarse en el DOM. */
  input: React.ReactNode;
  /** Último handle de directorio elegido (PC con FS Access API). Null en el resto. */
  lastDirHandle: FsDirHandle | null;
  /** Nombre legible del último directorio elegido (para mostrar en UI). */
  lastDirName: string | null;
}

export function useFileImport(
  accept: string,
  onFiles: (files: ImportedFile[]) => void,
  options?: { singleMode?: boolean }
): UseImportReturn {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"files" | "directory">("files");
  const [lastDirHandle, setLastDirHandle] = useState<FsDirHandle | null>(null);
  const [lastDirName, setLastDirName] = useState<string | null>(null);
  const singleMode = options?.singleMode ?? false;

  const pick = useCallback(async (m: "files" | "directory") => {
    // Single mode: bloquear importación de directorios y forzar
    // selección de un único archivo.
    if (singleMode && m === "directory") {
      return;
    }

    // En Android WebView, el selector de directorios no funciona via
    // <input webkitdirectory>. En su lugar, llamamos directamente a la
    // JavascriptInterface nativa que abre ACTION_OPEN_DOCUMENT_TREE (SAF).
    // Java lista los archivos y envía solo metadatos + content:// URI
    // (sin leer el contenido); el audio se reproduce por streaming vía
    // https://lozkho.local/... y el texto/binario pequeño se descarga
    // con fetch() solo cuando hace falta.
    const androidPicker = (typeof window !== "undefined")
      ? (window as any).AndroidFilePicker
      : null;

    if (m === "directory" && androidPicker && typeof androidPicker.pickDirectory === "function") {
      // Acumulador de archivos recibidos individualmente
      const collectedFiles: ImportedFile[] = [];

      // Callback que Java llama para CADA archivo individualmente.
      // Desde el rework de importación, Java NO lee el contenido de los
      // archivos: envía solo metadatos + el content:// URI de SAF. El audio
      // se reproduce por streaming vía https://lozkho.local/... (interceptor
      // del MainActivity con soporte de Range) y los archivos pequeños
      // (M3U8, JSON, LRC, miniaturas) se descargan con fetch() solo cuando
      // hacen falta. Antes cada MP3 viajaba completo como data-URL base64
      // por evaluateJavascript → importaciones de minutos y audio
      // duplicado en IndexedDB.
      (window as any).__lozkhoDirectoryFile = (fileObj: {
        name: string;
        relativePath: string;
        size: number;
        type: string;
        contentUri: string;
      }) => {
        if (!fileObj || !fileObj.contentUri) return;
        collectedFiles.push({
          name: fileObj.name,
          size: fileObj.size,
          type: fileObj.type || "application/octet-stream",
          relativePath: fileObj.relativePath,
          contentUrl: lozkhoLocalUrl(fileObj.contentUri),
        });
      };

      // Callback que Java llama cuando terminó de enviar todos los archivos
      (window as any).__lozkhoDirectoryDone = (_total: number) => {
        if (collectedFiles.length === 0) {
          console.warn("AndroidFilePicker: no se encontraron archivos compatibles.");
          return;
        }
        onFiles(collectedFiles);
        // Limpiar callbacks
        delete (window as any).__lozkhoDirectoryFile;
        delete (window as any).__lozkhoDirectoryDone;
      };

      // Llamar al método nativo que abre el selector de carpeta SAF
      // Pasar el filtro de extensiones para que Java solo lea los archivos
      // que nos interesan (evita OOM al no leer MP3s cuando importamos M3U8)
      androidPicker.pickDirectory(accept);
      return;
    }

    // PC con File System Access API: selector nativo de carpeta real.
    if (m === "directory" && canPickDirectory()) {
      // PC con File System Access API: selector nativo de carpeta real.
      // La llamada a showDirectoryPicker() debe ser síncrona respecto al
      // click del usuario para preservar la activación.
      const handle = await pickDirectoryForRead();
      if (!handle) {
        // Usuario canceló: sincronizar el modo para mantener UI consistente.
        setMode(m);
        return;
      }
      setMode(m);
      setLastDirHandle(handle);
      setLastDirName(handle.name);
      try {
        const files = await readAllFilesFromDir(handle, accept);
        if (files.length > 0) {
          onFiles(files);
        } else {
          console.warn(`Directorio "${handle.name}" no contiene archivos compatibles.`);
        }
      } catch (err) {
        console.error("fsAccess.readAllFilesFromDir:", err);
      }
      return;
    }

    // Fallback: <input type=file webkitdirectory> o normal.
    // En modo directorio NO pasamos accept para no restringir qué archivos
    // se ven en el selector de documentos (queremos audio + m3u8 + json).
    setMode(m);
    if (inputRef.current) {
      inputRef.current.value = "";
      // Forzar re-render para que el atributo accept cambie antes de click()
      requestAnimationFrame(() => {
        inputRef.current?.click();
      });
    }
  }, [accept, onFiles, singleMode]);

  const handle = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files;
      if (!list || list.length === 0) return;
      const files: ImportedFile[] = [];
      for (let i = 0; i < list.length; i++) {
        const f = list.item(i)!;
        const anyF = f as unknown as { webkitRelativePath?: string };
        files.push({
          name: f.name,
          size: f.size,
          type: f.type || "application/octet-stream",
          relativePath: anyF.webkitRelativePath || undefined,
          file: f,
        });
      }
      onFiles(files);
    },
    [onFiles]
  );

  const input = (
    <input
      ref={inputRef}
      type="file"
      multiple={!singleMode}
      accept={mode === "directory" ? undefined : accept}
      {...(mode === "directory" && !singleMode
        ? ({ webkitdirectory: "true", directory: "true" } as any)
        : {})}
      onChange={handle}
      className="hidden"
      aria-hidden
      tabIndex={-1}
    />
  );

  return { pick, input, lastDirHandle, lastDirName };
}

/**
 * Crea una blob URL a partir de un File. Útil para reproducir audio
 * importado con `<audio src="blob:...">`.
 *
 * IMPORTANTE: el llamador es responsable de revocar la URL con
 * `URL.revokeObjectURL(url)` cuando ya no se use, para liberar memoria.
 * En Lozkho Stereo no revocamos porque las URLs persisten con el track.
 */
export function createBlobUrl(file: File): string {
  return URL.createObjectURL(file);
}

/** Formatea el tamaño en bytes a una unidad legible. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Lee la duración real de una fuente de audio (en milisegundos) usando
 * un elemento <audio> temporal. Resuelve 0 si no se puede determinar.
 *
 * `source` puede ser:
 *  - Un File/Blob nativo (web/PC) → se crea una blob URL temporal.
 *  - Una URL reproducible (blob:, http(s):// o https://lozkho.local/...)
 *    → se usa directamente; en Android el MainActivity responde la
 *    petición de metadata vía el interceptor con soporte de Range.
 */
export function readAudioDurationMs(source: File | Blob | string): Promise<number> {
  return new Promise((resolve) => {
    const isUrl = typeof source === "string";
    const url = isUrl ? (source as string) : URL.createObjectURL(source as Blob);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.src = url;
    const cleanup = () => {
      if (!isUrl) URL.revokeObjectURL(url);
      audio.remove();
    };
    audio.onloadedmetadata = () => {
      const dur = audio.duration;
      cleanup();
      resolve(isFinite(dur) ? Math.round(dur * 1000) : 0);
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
  });
}
