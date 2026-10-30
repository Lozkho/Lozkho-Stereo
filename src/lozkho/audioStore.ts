/**
 * Almacenamiento persistente de archivos de audio/imágenes en IndexedDB.
 *
 * Problema: las blob: URLs (URL.createObjectURL) se invalidan al cerrar
 * el navegador/app. Tras recargar, las emisoras y su configuración se
 * conservan (localStorage), pero los archivos de audio importados se
 * pierden.
 *
 * Solución: guardar los File/Blob originales en IndexedDB (que sí
 * persiste) y restaurar las blob: URLs al cargar la app.
 *
 * Uso:
 *   import { audioStore } from "@/lozkho/audioStore";
 *
 *   // Guardar al importar
 *   const blobUrl = await audioStore.saveFile(stationId, trackId, file);
 *
 *   // Restaurar al cargar
 *   await audioStore.restoreAllUrls(useLozkho.getState);
 */

const DB_NAME = "lozkho-audio-store";
const DB_VERSION = 1;
const STORE_NAME = "audio-files";

class AudioStore {
  private db: IDBDatabase | null = null;
  private urlCache = new Map<string, string>(); // key → blobUrl

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      req.onsuccess = () => {
        this.db = req.result;
        resolve(this.db);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Guarda un archivo (File/Blob) en IndexedDB.
   * Retorna la blob: URL para usar inmediatamente.
   */
  async saveFile(key: string, file: Blob): Promise<string> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const record = { key, blob: file, savedAt: Date.now() };
      store.put(record);
      tx.oncomplete = () => {
        // Crear blob URL y cachearla
        const url = URL.createObjectURL(file);
        this.urlCache.set(key, url);
        resolve(url);
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Recupera un archivo de IndexedDB y devuelve su blob: URL.
   * Si no existe, retorna null.
   */
  async getUrl(key: string): Promise<string | null> {
    // Si ya está en caché, usarla
    if (this.urlCache.has(key)) {
      return this.urlCache.get(key)!;
    }

    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const record = req.result;
        if (record && record.blob) {
          const url = URL.createObjectURL(record.blob);
          this.urlCache.set(key, url);
          resolve(url);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Elimina un archivo de IndexedDB.
   */
  async deleteFile(key: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => {
        // Revocar URL cacheada si existe
        const url = this.urlCache.get(key);
        if (url) {
          URL.revokeObjectURL(url);
          this.urlCache.delete(key);
        }
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Restaura TODAS las blob: URLs de tracks y anuncios desde IndexedDB.
   * Llamar al cargar la app para que el audio vuelva a funcionar tras
   * una recarga.
   *
   * IMPORTANT: tras `partialize` (store.ts), los `sourceUri` y
   * `thumbnailUri` que eran `blob:` quedan en `null`. Por eso aquí
   * buscamos SIEMPRE en IndexedDB por `track.id` / `thumb-${station.id}`,
   * SIN condicionar al valor actual del uri. Si el uri es `null`/`""`
   * y no hay nada en IndexedDB, marcamos el track como no disponible.
   *
   * @param getState función para acceder al estado de Zustand
   * @param setState función para actualizar el estado de Zustand
   */
  async restoreAllUrls(
    getState: () => { stations: any[] },
    setState: (patch: any) => void
  ): Promise<{ restored: number; failed: number }> {
    let restored = 0;
    let failed = 0;
    const { stations } = getState();
    const updatedStations = [];

    for (const station of stations) {
      const updatedPlaylist = [];
      const updatedAds = [];

      // Restaurar tracks
      for (const track of station.playlist || []) {
        const uri = track.sourceUri ?? "";

        // URLs remotas: no necesitan restauración
        if (uri && (uri.startsWith("http") || uri.startsWith("content://lozkho.demo/"))) {
          updatedPlaylist.push(track);
          continue;
        }

        // Para URIs blob: stale, null, "" o relativas — buscar en IndexedDB
        // por track.id (que es la key con la que se guardó al importar).
        try {
          const newUrl = await this.getUrl(track.id);
          if (newUrl) {
            updatedPlaylist.push({ ...track, sourceUri: newUrl });
            restored++;
          } else {
            // No encontrado en IndexedDB: preservar el uri actual si era
            // válido (p. ej. http remoto ya cubierto arriba), o marcar como
            // no disponible solo si no había nada.
            if (uri && uri !== "demo:no-audio") {
              updatedPlaylist.push(track);
            } else {
              updatedPlaylist.push({
                ...track,
                sourceUri: "demo:no-audio",
                license: (track.license || "") + " (archivo no disponible)",
              });
              failed++;
            }
          }
        } catch {
          updatedPlaylist.push(track);
          failed++;
        }
      }

      // Restaurar anuncios
      for (const ad of station.ads || []) {
        const uri = ad.sourceUri ?? "";
        if (uri && (uri.startsWith("http") || uri.startsWith("content://lozkho.demo/"))) {
          updatedAds.push(ad);
          continue;
        }
        try {
          const newUrl = await this.getUrl(ad.id);
          if (newUrl) {
            updatedAds.push({ ...ad, sourceUri: newUrl });
            restored++;
          } else if (uri) {
            updatedAds.push(ad);
          } else {
            updatedAds.push({ ...ad, sourceUri: "" });
            failed++;
          }
        } catch {
          updatedAds.push(ad);
          failed++;
        }
      }

      // Restaurar miniatura — buscar SIEMPRE por thumb-${station.id}
      let thumbnailUri = station.thumbnailUri;
      // Solo buscar si el actual no es ya un blob: válido o http/data URL
      const currentThumb = thumbnailUri ?? "";
      if (
        !currentThumb.startsWith("blob:") &&
        !currentThumb.startsWith("http") &&
        !currentThumb.startsWith("data:")
      ) {
        try {
          const newUrl = await this.getUrl(`thumb-${station.id}`);
          if (newUrl) {
            thumbnailUri = newUrl;
            restored++;
          } else {
            // Mantener null/lo que tuviera
            if (thumbnailUri) failed++;
            thumbnailUri = null;
          }
        } catch {
          failed++;
        }
      }

      updatedStations.push({
        ...station,
        playlist: updatedPlaylist,
        ads: updatedAds,
        thumbnailUri,
      });
    }

    // IMPORTANTE: siempre hacer setState, incluso si restored=0, para que
    // los tracks sin audio queden marcados como "demo:no-audio" y el
    // AudioPlayer sepa manejarlos en lugar de quedarse colgado.
    setState({ stations: updatedStations });

    return { restored, failed };
  }
}

// Singleton
export const audioStore = new AudioStore();
