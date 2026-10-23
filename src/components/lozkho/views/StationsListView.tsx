"use client";

import { useState } from "react";
import { useLozkho } from "@/lozkho/store";
import { buildExtendedPlaylist, computeCycleDurationMs } from "@/lozkho/store";
import {
  formatClock,
  formatFrequency,
  formatDurationLong,
  gradientThumbnail,
  hexToRgba,
} from "@/lozkho/format";
import {
  Plus,
  Radio,
  Repeat,
  Upload,
  Download,
  Music,
  FileText,
  Info,
  Pencil,
  Copy,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ImportExportDialog,
  type ImportExportFormat,
} from "@/components/lozkho/ImportExportDialog";
import { StationEditor } from "@/components/lozkho/StationEditor";
import { toast } from "sonner";
import type { ImportedFile } from "@/lozkho/useFileImport";

const STATION_FORMATS: ImportExportFormat[] = [
  {
    id: "m3u8",
    label: "M3U8 (UTF-8) + JSON sidecar",
    description:
      "Lista de reproducción M3U8 con referencias a rutas persistentes + JSON con metadatos de emisora (frecuencia, colores, mood, eslogan, programación de anuncios). Recomendado.",
    accept: ".m3u8,.m3u,.json,.zip",
  },
  {
    id: "m3u",
    label: "M3U clásico",
    description:
      "Lista de reproducción M3U (Latin-1). Solo referencia rutas; sin metadatos avanzados. Útil para compatibilidad con otros reproductores.",
    accept: ".m3u",
  },
  {
    id: "json",
    label: "JSON completo (sin rutas)",
    description:
      "Exporta la configuración de la emisora sin las rutas a archivos. Útil para compartir plantillas de emisoras vacías.",
    accept: ".json",
  },
  {
    id: "zip",
    label: "ZIP completo (emisoras + datos)",
    description:
      "Archivo ZIP con todas las emisoras (M3U8 + JSON por emisora). Útil para backup completo. No incluye los archivos de audio, solo referencias.",
    accept: ".zip",
  },
];

const TRACK_FORMATS: ImportExportFormat[] = [
  {
    id: "audio",
    label: "Archivos de audio (MP3, M4A/AAC, FLAC, OGG, Opus, WAV)",
    description:
      "Importa archivos de audio individuales o un directorio completo. Se leerán metadatos ID3/Vorbis/FLAC al importar.",
    accept: "audio/*,.mp3,.m4a,.aac,.flac,.ogg,.opus,.wav,.wma",
  },
];

const PERSISTENCE_NOTE_STATIONS = (
  <div>
    <p className="font-semibold mb-1">Referencias persistentes:</p>
    <ul className="list-disc pl-4 space-y-0.5">
      <li>
        <strong>Android 10+:</strong> SAF con <code>takePersistableUriPermission</code>,
        rutas <code>content://</code> que sobreviven reinicios.
      </li>
      <li>
        <strong>Windows:</strong> rutas absolutas con permiso de carpeta
        persistente, o symlinks al directorio de la app.
      </li>
      <li>
        Los archivos <strong>no se copian</strong>: se referencian en su
        ubicación original. Si mueves o eliminas el archivo original, la
        emisora mostrará la pista como «no disponible».
      </li>
      <li>
        M3U/M3U8 no transporta metadatos avanzados (género, carátula, mood,
        colores). Esos se enriquecen desde las etiquetas del archivo o desde el
        JSON sidecar.
      </li>
    </ul>
  </div>
);

const PERSISTENCE_NOTE_TRACKS = (
  <div>
    <p className="font-semibold mb-1">Al importar canciones:</p>
    <ul className="list-disc pl-4 space-y-0.5">
      <li>
        Los archivos se añaden a la <strong>emisora activa</strong>. En la app
        nativa podrás elegir la emisora destino.
      </li>
      <li>
        Metadatos (título, artista, álbum, género) se leen de las etiquetas
        ID3/Vorbis/FLAC del propio archivo.
      </li>
      <li>
        Si faltan metadatos, se usa el nombre del archivo como título.
      </li>
      <li>
        Formatos soportados: MP3, AAC/M4A, FLAC, OGG/Vorbis, Opus, WAV. WMA y
        ALAC pueden requerir códecs instalados en Windows. Material con DRM no
        es compatible.
      </li>
    </ul>
  </div>
);

export function StationsListView() {
  const stations = useLozkho((s) => s.stations);
  const setActiveStation = useLozkho((s) => s.setActiveStation);
  const activeId = useLozkho((s) => s.activeStationId);
  const setView = useLozkho((s) => s.setView);
  const createStation = useLozkho((s) => s.createStation);
  const duplicateStation = useLozkho((s) => s.duplicateStation);
  const deleteStation = useLozkho((s) => s.deleteStation);

  const [importStationOpen, setImportStationOpen] = useState(false);
  const [exportStationOpen, setExportStationOpen] = useState(false);
  const [importTracksOpen, setImportTracksOpen] = useState(false);
  // Editor de emisora
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorStationId, setEditorStationId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<"edit" | "create">("edit");

  const openEditor = (id: string, mode: "edit" | "create" = "edit") => {
    setEditorStationId(id);
    setEditorMode(mode);
    setEditorOpen(true);
  };

  const openEditorForActive = () => {
    setEditorStationId(activeId);
    setEditorMode("edit");
    setEditorOpen(true);
  };

  const handleCreateStation = () => {
    const newId = createStation();
    openEditor(newId, "create");
    toast.success("Nueva emisora creada", {
      description: "Configúrala a continuación.",
    });
  };

  const handleDuplicateStation = (id: string, name: string) => {
    const newId = duplicateStation(id);
    toast.success("Emisora duplicada", {
      description: `"${name}" → copia independiente.`,
    });
    // Opcional: abrir editor de la nueva emisora
    openEditor(newId, "edit");
  };

  const handleDeleteStation = (id: string, name: string) => {
    if (stations.length <= 1) {
      toast.error("No se puede eliminar", {
        description: "Debe existir al menos una emisora.",
      });
      return;
    }
    if (!confirm(`¿Eliminar la emisora "${name}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    deleteStation(id);
    toast.success("Emisora eliminada", { description: name });
  };

  const handleImportStations = (files: ImportedFile[], formatId: string) => {
    const fmt = STATION_FORMATS.find((f) => f.id === formatId);
    toast.success(
      `Importación simulada de ${files.length} archivo(s) de emisora (${fmt?.label ?? formatId})`,
      {
        description:
          "En la app nativa: se parsea el M3U8/JSON/ZIP y se añaden las emisoras con sus referencias persistentes. El prototipo no almacena archivos.",
      }
    );
  };

  const handleExportStations = (formatId: string) => {
    const fmt = STATION_FORMATS.find((f) => f.id === formatId);
    toast.success(
      `Exportación simulada a ${fmt?.label ?? formatId}`,
      {
        description: `En la app nativa: se generarían ${
          formatId === "zip" ? "un ZIP con todas las emisoras" : "un archivo"
        } en el directorio de descargas del dispositivo.`,
      }
    );
  };

  const handleImportTracks = (files: ImportedFile[], formatId: string) => {
    const audioFiles = files.filter(
      (f) =>
        f.type.startsWith("audio/") ||
        /\.(mp3|m4a|aac|flac|ogg|opus|wav|wma)$/i.test(f.name)
    );
    toast.success(
      `Importación simulada de ${audioFiles.length} pista(s) de audio`,
      {
        description: `En la app nativa: se leerían los metadatos de cada archivo y se añadirían a la emisora activa. Formato: ${formatId}.`,
      }
    );
  };

  return (
    <div className="px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-32 min-h-[100dvh]">
      <header className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/40">
            Lozkho Stereo
          </p>
          <h1 className="text-xl font-bold text-white">Tus emisoras</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="bg-white/5 border-white/15 text-white hover:bg-white/10"
            onClick={() => setImportStationOpen(true)}
          >
            <Upload size={14} className="mr-1" /> Importar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="bg-white/5 border-white/15 text-white hover:bg-white/10"
            onClick={() => setExportStationOpen(true)}
          >
            <Download size={14} className="mr-1" /> Exportar
          </Button>
        </div>
      </header>

      {/* Acciones rápidas */}
      <section className="grid grid-cols-2 gap-2 mb-3">
        <button
          onClick={openEditorForActive}
          className="rounded-xl border border-sky-500/30 bg-sky-500/[0.06] p-3 text-left hover:bg-sky-500/[0.12] transition active:scale-[0.98]"
        >
          <div className="flex items-center gap-2 mb-1">
            <Pencil size={14} className="text-sky-300" />
            <span className="text-[12px] font-semibold text-white">
              Editar emisora activa
            </span>
          </div>
          <p className="text-[10px] text-white/55 leading-snug">
            Modifica identidad, apariencia, playlist y anuncios.
          </p>
        </button>
        <button
          onClick={handleCreateStation}
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3 text-left hover:bg-emerald-500/[0.12] transition active:scale-[0.98]"
        >
          <div className="flex items-center gap-2 mb-1">
            <Plus size={14} className="text-emerald-300" />
            <span className="text-[12px] font-semibold text-white">
              Crear nueva emisora
            </span>
          </div>
          <p className="text-[10px] text-white/55 leading-snug">
            Crea una emisora vacía y abre el editor para configurarla.
          </p>
        </button>
      </section>

      <div className="space-y-3">
        {stations.map((s) => {
          const active = s.id === activeId;
          const accent = s.colors.accent;
          const cycle = computeCycleDurationMs(s);
          const extended = buildExtendedPlaylist(s);
          const cur = extended[s.playback.currentItemIndex % extended.length];
          return (
            <div
              key={s.id}
              className="block w-full text-left rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden"
              style={
                active
                  ? { boxShadow: `0 0 0 1px ${hexToRgba(accent, 0.55)}` }
                  : undefined
              }
            >
              {/* Zona clicable: cambiar de emisora activa */}
              <button
                onClick={() => {
                  setActiveStation(s.id);
                  setView("emisora");
                }}
                className="block w-full text-left p-4 hover:bg-white/[0.02] transition"
                aria-label={`Activar emisora ${s.name}`}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="relative w-16 h-16 rounded-2xl overflow-hidden shrink-0 bg-cover bg-center vinyl-spin"
                    style={
                      s.thumbnailUri
                        ? { backgroundImage: `url(${s.thumbnailUri})` }
                        : { background: gradientThumbnail(accent, s.colors.accent2) }
                    }
                    aria-hidden
                  >
                    {/* Agujero del vinilo SIEMPRE visible */}
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-black/80 ring-2 ring-white/20" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span
                        className="freq-display text-2xl font-bold"
                        style={{ color: accent }}
                      >
                        {formatFrequency(s.frequency, s.band)}
                      </span>
                      <span className="text-[10px] uppercase tracking-widest text-white/40">
                        {s.band}
                      </span>
                    </div>
                    <p className="text-base font-semibold text-white truncate">
                      {s.name}
                    </p>
                    <p className="text-xs text-white/55 truncate">{s.mood}</p>
                  </div>
                  <div className="text-right">
                    {active ? (
                      <Badge
                        variant="secondary"
                        className="bg-white/10 text-white border-white/15"
                      >
                        <Radio size={10} className="mr-1" /> Sonando
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-emerald-500/40 text-emerald-300 bg-emerald-500/10"
                      >
                        <span className="live-dot w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1" />{" "}
                        2º plano
                      </Badge>
                    )}
                  </div>
                </div>
              </button>

              {/* Estadísticas */}
              <div className="px-4 pb-2">
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="rounded-lg bg-white/[0.03] p-2 border border-white/10">
                    <p className="text-white/45 uppercase tracking-widest text-[9px]">
                      Pistas
                    </p>
                    <p className="text-white/85 font-semibold">{s.playlist.length}</p>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] p-2 border border-white/10">
                    <p className="text-white/45 uppercase tracking-widest text-[9px]">
                      Anuncios
                    </p>
                    <p className="text-white/85 font-semibold">{s.ads.length}</p>
                  </div>
                  <div className="rounded-lg bg-white/[0.03] p-2 border border-white/10">
                    <p className="text-white/45 uppercase tracking-widest text-[9px]">
                      Ciclo
                    </p>
                    <p className="text-white/85 font-semibold">
                      {formatDurationLong(cycle)}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-white/55">
                  {active ? "Sonando ahora: " : "En segundo plano: "}
                  <span className="text-white/85">{cur?.ref.title ?? "—"}</span>{" "}
                  ·{" "}
                  <span className="freq-display">
                    {formatClock(s.playback.positionMs)} /{" "}
                    {formatClock(cur?.ref.durationMs ?? 0)}
                  </span>
                </p>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-white/45 uppercase tracking-widest">
                  <Repeat size={11} /> Bucle infinito · Anuncios cada {s.adEvery}{" "}
                  pistas
                </div>
              </div>

              {/* Barra de acciones */}
              <div className="flex items-center gap-1 px-4 pb-3 pt-1 border-t border-white/5 mt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openEditor(s.id, "edit")}
                  className="h-7 text-[11px] bg-white/5 border-white/15 text-white hover:bg-white/10 hover:text-white"
                >
                  <Pencil size={11} className="mr-1" /> Editar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleDuplicateStation(s.id, s.name)}
                  className="h-7 text-[11px] bg-white/5 border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <Copy size={11} className="mr-1" /> Duplicar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleDeleteStation(s.id, s.name)}
                  disabled={stations.length <= 1}
                  className="h-7 text-[11px] bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20 hover:text-rose-200 disabled:opacity-30"
                >
                  <Trash2 size={11} className="mr-1" /> Eliminar
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={handleCreateStation}
        className="mt-4 w-full rounded-3xl border-2 border-dashed border-white/15 bg-white/[0.02] p-5 text-white/60 hover:bg-white/[0.04] hover:text-white/80 transition flex items-center justify-center gap-2"
      >
        <Plus size={18} /> Crear nueva emisora
      </button>

      <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <h2 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <Info size={14} className="text-white/60" />
          Formatos y límites de importación/exportación
        </h2>
        <p className="text-[12px] text-white/65 leading-relaxed">
          Formato principal: <strong>M3U8</strong> (UTF-8) + JSON sidecar para
          metadatos. Alternativas: M3U clásico, JSON puro, ZIP completo.
        </p>
        <ul className="mt-2 space-y-1 text-[11px] text-white/55 list-disc pl-5">
          <li>
            M3U8/M3U solo referencia rutas a archivos; no transporta metadatos
            de género, carátula ni letras. Esos se enriquecen desde las
            etiquetas ID3/FLAC/Vorbis al importar.
          </li>
          <li>
            En Android 10+ las rutas se conservan como <code>content://</code>{" "}
            persistentes (SAF con <code>takePersistableUriPermission</code>), no
            como rutas de archivos planas.
          </li>
          <li>
            En Windows se conservan rutas absolutas (con permiso de carpeta) o
            symlinks bajo el directorio de datos de la app.
          </li>
          <li>
            Las emisoras se pueden exportar como JSON junto al M3U8 para no
            perder frecuencia, colores, mood, eslogan y programación de anuncios.
          </li>
          <li>
            El ZIP completo contiene todas las emisoras (M3U8 + JSON por cada
            una) pero <strong>no</strong> los archivos de audio — solo
            referencias. Útil para backups de configuración.
          </li>
        </ul>
      </section>

      {/* Diálogos */}
      <ImportExportDialog
        open={importStationOpen}
        onOpenChange={setImportStationOpen}
        mode="import"
        kindLabel="emisora(s)"
        formats={STATION_FORMATS}
        persistenceNote={PERSISTENCE_NOTE_STATIONS}
        onImport={handleImportStations}
      />
      <ImportExportDialog
        open={exportStationOpen}
        onOpenChange={setExportStationOpen}
        mode="export"
        kindLabel="emisora(s)"
        formats={STATION_FORMATS}
        persistenceNote={PERSISTENCE_NOTE_STATIONS}
        onExport={handleExportStations}
        allowDirectory={false}
      />
      <ImportExportDialog
        open={importTracksOpen}
        onOpenChange={setImportTracksOpen}
        mode="import"
        kindLabel="canciones"
        formats={TRACK_FORMATS}
        persistenceNote={PERSISTENCE_NOTE_TRACKS}
        onImport={handleImportTracks}
      />

      {/* Editor completo de emisora */}
      <StationEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        stationId={editorStationId}
        mode={editorMode}
      />
    </div>
  );
}
