"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Hook para importar archivos en Lozkho Stereo.
 *
 * En el prototipo web usamos el `<input type="file" multiple>` y
 * `webkitdirectory` reales. Los archivos se exponen como ImportedFile
 * con su File nativo, lo que permite:
 *   - Crear blob URLs para reproducción de audio
 *   - Leer metadatos (tamaño, tipo MIME)
 *   - Mantener la referencia al File para futuras operaciones
 *
 * En la app nativa (Tauri/Flutter):
 * - Android: SAF con `takePersistableUriPermission` para `content://`
 * - Windows: rutas absolutas con permiso de carpeta persistente
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
   * - `mode: "files"` → archivos individuales
   * - `mode: "directory"` → directorio completo
   */
  pick: (mode: "files" | "directory") => void;
  /** Elemento input oculto que debe renderizarse en el DOM. */
  input: React.ReactNode;
}

export function useFileImport(
  accept: string,
  onFiles: (files: ImportedFile[]) => void
): UseImportReturn {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"files" | "directory">("files");

  const pick = useCallback((m: "files" | "directory") => {
    setMode(m);
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.click();
  }, []);

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
      multiple
      accept={accept}
      {...(mode === "directory"
        ? ({ webkitdirectory: "true", directory: "true" } as any)
        : {})}
      onChange={handle}
      className="hidden"
      aria-hidden
      tabIndex={-1}
    />
  );

  return { pick, input };
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
