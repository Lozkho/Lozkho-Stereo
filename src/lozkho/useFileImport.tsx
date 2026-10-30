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
  /** File nativo del navegador — permite crear blob URLs para audio. */
  file: File;
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
    // Java lee los archivos, los convierte a base64 data URLs, y los
    // envía de vuelta via window.__lozkhoDirectoryResult().
    const androidPicker = (typeof window !== "undefined")
      ? (window as any).AndroidFilePicker
      : null;

    if (m === "directory" && androidPicker && typeof androidPicker.pickDirectory === "function") {
      // Acumulador de archivos recibidos individualmente
      const collectedFiles: ImportedFile[] = [];

      // Callback que Java llama para CADA archivo individualmente
      // (en lugar de un solo array grande que causa OOM)
      (window as any).__lozkhoDirectoryFile = (fileObj: {
        name: string;
        relativePath: string;
        size: number;
        type: string;
        dataUrl: string;
      }) => {
        if (!fileObj || !fileObj.dataUrl) return;
        try {
          const arr = fileObj.dataUrl.split(",");
          const mimeMatch = arr[0]?.match(/data:([^;]+)/);
          const mime = mimeMatch?.[1] || fileObj.type || "application/octet-stream";
          const byteString = atob(arr[1] || "");
          const bytes = new Uint8Array(byteString.length);
          for (let i = 0; i < byteString.length; i++) {
            bytes[i] = byteString.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: mime });
          const file = new File([blob], fileObj.name, { type: mime });
          collectedFiles.push({
            name: fileObj.name,
            size: fileObj.size,
            type: fileObj.type,
            relativePath: fileObj.relativePath,
            file,
          });
        } catch (err) {
          console.error("Error procesando archivo:", err);
        }
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
 * Lee la duración real de un archivo de audio (en milisegundos) usando
 * un elemento <audio> temporal. Resuelve 0 si no se puede determinar.
 */
export function readAudioDurationMs(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.src = url;
    const cleanup = () => {
      URL.revokeObjectURL(url);
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
