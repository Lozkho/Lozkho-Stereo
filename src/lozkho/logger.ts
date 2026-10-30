/**
 * Logger global para diagnóstico de la app Lozkho Stereo.
 *
 * Captura eventos importantes (carga, restauración de blobs, importación,
 * reproducción, errores) en un buffer circular y los expone a la UI para
 * que el usuario pueda verlos sin necesidad de adb / DevTools.
 *
 * El buffer es de 200 entradas, las más recientes al final.
 *
 * Uso:
 *   import { lozkhoLog } from "@/lozkho/logger";
 *   lozkhoLog.info("mensaje", { detalle: ... });
 *   lozkhoLog.error("mensaje de error", err);
 *
 *   import { useLogs } from "@/lozkho/logger";
 *   const logs = useLogs();  // suscribe a cambios
 */

import { useEffect, useState } from "react";

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  id: number;
  ts: number;
  level: LogLevel;
  msg: string;
  detail?: unknown;
}

const MAX_ENTRIES = 200;

class LozkhoLogger {
  private entries: LogEntry[] = [];
  private nextId = 1;
  private listeners = new Set<() => void>();

  private emit() {
    // Snapshot con slice para que React detecte cambio de referencia
    const snapshot = this.entries.slice();
    this._lastSnapshot = snapshot;
    for (const l of this.listeners) {
      try {
        l();
      } catch {
        /* ignore listener errors */
      }
    }
  }

  private _lastSnapshot: LogEntry[] = [];

  /** Snapshot actual del buffer (inmutable). */
  getSnapshot(): LogEntry[] {
    return this._lastSnapshot;
  }

  private push(level: LogLevel, msg: string, detail?: unknown) {
    const entry: LogEntry = {
      id: this.nextId++,
      ts: Date.now(),
      level,
      msg,
      detail,
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }
    this.emit();
    // También loguear a la consola del navegador para depuración externa
    const consoleFn =
      level === "error"
        ? console.error
        : level === "warn"
          ? console.warn
          : level === "debug"
            ? console.debug
            : console.info;
    if (detail !== undefined) {
      consoleFn(`[lozkho] ${msg}`, detail);
    } else {
      consoleFn(`[lozkho] ${msg}`);
    }
  }

  info(msg: string, detail?: unknown) {
    this.push("info", msg, detail);
  }
  warn(msg: string, detail?: unknown) {
    this.push("warn", msg, detail);
  }
  error(msg: string, detail?: unknown) {
    this.push("error", msg, detail);
  }
  debug(msg: string, detail?: unknown) {
    this.push("debug", msg, detail);
  }

  clear() {
    this.entries = [];
    this.emit();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const lozkhoLog = new LozkhoLogger();

/**
 * Hook para suscribirse al buffer de logs desde la UI.
 */
export function useLogs(): LogEntry[] {
  const [, setVersion] = useState(0);
  useEffect(() => {
    return lozkhoLog.subscribe(() => {
      setVersion((v) => v + 1);
    });
  }, []);
  return lozkhoLog.getSnapshot();
}

/**
 * Formatea un timestamp a HH:MM:SS.mmm.
 */
export function formatLogTs(ts: number): string {
  const d = new Date(ts);
  return (
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0") +
    ":" +
    String(d.getSeconds()).padStart(2, "0") +
    "." +
    String(d.getMilliseconds()).padStart(3, "0")
  );
}
