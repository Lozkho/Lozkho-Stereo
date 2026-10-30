"use client";

import { useMemo, useState } from "react";
import { useLogs, formatLogTs, type LogEntry, type LogLevel } from "@/lozkho/logger";
import { useLozkho } from "@/lozkho/store";
import { audioStore } from "@/lozkho/audioStore";
import {
  Terminal,
  X,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info,
  Bug,
  Copy,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Botón flotante + drawer para ver logs de diagnóstico en tiempo real.
 *
 * El usuario puede abrirlo cuando algo no funcione (no carga la emisora,
 * no suena el audio, etc.) y ver qué pasó. Incluye acciones para:
 *  - Vaciar logs
 *  - Forzar restauración manual de blobs desde IndexedDB
 *  - Copiar logs al portapapeles (para reportar bugs)
 *  - Filtrar por nivel (info/warn/error/debug)
 */
export function DebugLogButton() {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<LogLevel | "all">("all");
  const [collapsed, setCollapsed] = useState(false);
  const logs = useLogs();

  const counts = useMemo(() => {
    const c = { info: 0, warn: 0, error: 0, debug: 0 };
    for (const l of logs) c[l.level]++;
    return c;
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (filter === "all") return logs;
    return logs.filter((l) => l.level === filter);
  }, [logs, filter]);

  const handleRestoreBlobs = async () => {
    toast.info("Forzando restauración de blobs desde IndexedDB...");
    try {
      const result = await audioStore.restoreAllUrls(
        () => {
          const s = useLozkho.getState();
          return { stations: s.stations };
        },
        (patch: any) => useLozkho.setState(patch)
      );
      toast.success(
        `Restauración: ${result.restored} OK, ${result.failed} fallidos`,
        {
          description:
            result.restored > 0
              ? "Recarga la emisora para que el audio vuelva a sonar."
              : "No había blobs pendientes. Revisa los logs para más info.",
        }
      );
    } catch (e) {
      toast.error("Error al restaurar blobs", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const handleCopy = async () => {
    const text = filteredLogs
      .map((l) => {
        const detailStr =
          l.detail !== undefined
            ? " " + (typeof l.detail === "string" ? l.detail : JSON.stringify(l.detail))
            : "";
        return `[${formatLogTs(l.ts)}] ${l.level.toUpperCase()} ${l.msg}${detailStr}`;
      })
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${filteredLogs.length} logs copiados al portapapeles`);
    } catch {
      toast.error("No se pudo copiar al portapapeles");
    }
  };

  return (
    <>
      {/* Botón flotante */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Abrir logs de diagnóstico"
        title="Logs de diagnóstico"
        className={`fixed bottom-20 right-4 z-40 rounded-full w-11 h-11 flex items-center justify-center border backdrop-blur-md transition active:scale-95 ${
          open
            ? "bg-white text-black border-white"
            : counts.error > 0
              ? "bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30"
              : counts.warn > 0
                ? "bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25"
                : "bg-black/60 text-white/70 border-white/15 hover:bg-black/80"
        }`}
      >
        <Terminal size={18} />
        {(counts.error > 0 || counts.warn > 0) && !open && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
            {counts.error + counts.warn}
          </span>
        )}
      </button>

      {/* Drawer */}
      {open && (
        <div
          className="fixed inset-0 z-30 pointer-events-none"
          aria-hidden
        >
          <div className="absolute bottom-36 right-4 left-4 sm:left-auto sm:w-[min(640px,90vw)] pointer-events-auto bg-zinc-950/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <Terminal size={14} className="text-white/70" />
                <span className="text-xs font-semibold text-white/90 uppercase tracking-widest">
                  Logs
                </span>
                <span className="text-[10px] text-white/40">
                  {filteredLogs.length}/{logs.length}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCollapsed((v) => !v)}
                  className="text-white/50 hover:text-white p-1 rounded"
                  aria-label={collapsed ? "Expandir" : "Colapsar"}
                  title={collapsed ? "Expandir" : "Colapsar"}
                >
                  {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-white/50 hover:text-white p-1 rounded"
                  aria-label="Cerrar"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {!collapsed && (
              <>
                {/* Filtros + acciones */}
                <div className="flex items-center gap-1 px-3 py-2 border-b border-white/10 shrink-0 overflow-x-auto">
                  {(["all", "error", "warn", "info", "debug"] as const).map((f) => {
                    const count = f === "all" ? logs.length : counts[f];
                    const active = filter === f;
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFilter(f)}
                        className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded-md border whitespace-nowrap transition ${
                          active
                            ? "bg-white text-black border-white"
                            : "border-white/10 text-white/50 hover:text-white/80 hover:bg-white/5"
                        }`}
                      >
                        {f} {count > 0 && `(${count})`}
                      </button>
                    );
                  })}
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={handleRestoreBlobs}
                    title="Forzar restauración de blobs desde IndexedDB"
                    className="flex items-center gap-1 text-[10px] text-sky-300 hover:text-sky-200 px-2 py-1 rounded-md hover:bg-sky-500/10 transition"
                  >
                    <RefreshCw size={11} /> Restaurar blobs
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    title="Copiar logs al portapapeles"
                    className="flex items-center gap-1 text-[10px] text-white/60 hover:text-white px-2 py-1 rounded-md hover:bg-white/10 transition"
                  >
                    <Copy size={11} /> Copiar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("¿Vaciar todos los logs?")) {
                        import("@/lozkho/logger").then((m) => m.lozkhoLog.clear());
                      }
                    }}
                    title="Vaciar logs"
                    className="flex items-center gap-1 text-[10px] text-rose-300 hover:text-rose-200 px-2 py-1 rounded-md hover:bg-rose-500/10 transition"
                  >
                    <Trash2 size={11} /> Vaciar
                  </button>
                </div>

                {/* Lista de logs */}
                <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[11px] leading-relaxed lozkho-scroll">
                  {filteredLogs.length === 0 ? (
                    <p className="text-white/30 text-center py-8 text-xs">
                      Sin logs. Importa una emisora o reproduce audio para ver actividad.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {filteredLogs.map((l) => (
                        <LogLine key={l.id} entry={l} />
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  const icon = useMemo(() => {
    switch (entry.level) {
      case "error":
        return <AlertTriangle size={11} className="text-rose-400 shrink-0 mt-0.5" />;
      case "warn":
        return <AlertTriangle size={11} className="text-amber-400 shrink-0 mt-0.5" />;
      case "debug":
        return <Bug size={11} className="text-purple-400 shrink-0 mt-0.5" />;
      default:
        return <Info size={11} className="text-sky-400 shrink-0 mt-0.5" />;
    }
  }, [entry.level]);

  const colorClass =
    entry.level === "error"
      ? "text-rose-300"
      : entry.level === "warn"
        ? "text-amber-200"
        : entry.level === "debug"
          ? "text-purple-200"
          : "text-white/80";

  const detailStr = useMemo(() => {
    if (entry.detail === undefined) return null;
    if (typeof entry.detail === "string") return entry.detail;
    try {
      return JSON.stringify(entry.detail, null, 2);
    } catch {
      return String(entry.detail);
    }
  }, [entry.detail]);

  return (
    <li className="flex gap-2 py-0.5">
      <span className="text-white/40 shrink-0">{formatLogTs(entry.ts)}</span>
      {icon}
      <div className="flex-1 min-w-0">
        <span className={colorClass}>{entry.msg}</span>
        {detailStr && (
          <pre className="mt-0.5 text-white/50 whitespace-pre-wrap break-words text-[10px]">
            {detailStr}
          </pre>
        )}
      </div>
    </li>
  );
}
