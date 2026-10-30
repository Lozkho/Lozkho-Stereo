"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  useLozkho,
  computeCycleDurationMs,
  buildExtendedPlaylist,
} from "@/lozkho/store";
import {
  formatDurationLong,
  formatClock,
  gradientThumbnail,
  hexToRgba,
} from "@/lozkho/format";
import { FONT_CATALOG, getFontFamily } from "@/lozkho/fonts";
import type { Band, FontKey, Station, Track, Ad } from "@/lozkho/types";
import { useFileImport, formatBytes, type ImportedFile, createBlobUrl, readAudioDurationMs } from "@/lozkho/useFileImport";
import { audioStore } from "@/lozkho/audioStore";
import { toast } from "sonner";
import {
  Type,
  Image as ImageIcon,
  Trash2,
  Upload,
  Plus,
  Music,
  Megaphone,
  Pencil,
  Copy,
  ChevronUp,
  ChevronDown,
  X,
  AlertTriangle,
  Folder,
} from "lucide-react";

interface StationEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ID de la emisora a editar. Si es null, no abre. */
  stationId: string | null;
  /** Modo "create" muestra un banner indicando que es nueva. */
  mode?: "edit" | "create";
}

const PALETTE_PRESETS: { name: string; a: string; a2: string }[] = [
  { name: "Ámbar", a: "#F59E0B", a2: "#7C2D12" },
  { name: "Violeta", a: "#A855F7", a2: "#1E1B4B" },
  { name: "Esmeralda", a: "#10B981", a2: "#064E3B" },
  { name: "Rosa", a: "#EC4899", a2: "#500724" },
  { name: "Cian", a: "#06B6D4", a2: "#083344" },
  { name: "Rojo", a: "#EF4444", a2: "#450A0A" },
  { name: "Lima", a: "#84CC16", a2: "#1A2E05" },
  { name: "Azul", a: "#3B82F6", a2: "#0C1E5E" },
  { name: "Naranja", a: "#F97316", a2: "#431407" },
  { name: "Turquesa", a: "#14B8A6", a2: "#042F2E" },
  { name: "Magenta", a: "#D946EF", a2: "#3B0764" },
  { name: "Oro", a: "#EAB308", a2: "#422006" },
];

export function StationEditor({
  open,
  onOpenChange,
  stationId,
  mode = "edit",
}: StationEditorProps) {
  const stations = useLozkho((s) => s.stations);
  const {
    updateStation,
    deleteStation,
    duplicateStation,
    addTrackToStation,
    removeTrackFromStation,
    reorderPlaylist,
    addAdToStation,
    removeAdFromStation,
    setActiveStation,
  } = useLozkho();

  const station = stations.find((s) => s.id === stationId) ?? null;

  // Estado local para el formulario de añadir pista/anuncio manualmente
  const [newTrackTitle, setNewTrackTitle] = useState("");
  const [newTrackArtist, setNewTrackArtist] = useState("");
  const [newAdTitle, setNewAdTitle] = useState("");
  const [newAdSponsor, setNewAdSponsor] = useState("");

  // Hook para importar miniatura
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  /**
   * Genera un Track a partir de un archivo importado.
   * Crea una blob URL real, lee la duración del archivo (async), y
   * guarda el File en IndexedDB para que persista tras recarga.
   *
   * Si el archivo viene de un directorio (relativePath presente),
   * usa el nombre del archivo como título. Si el nombre tiene el patrón
   * "artista - título", lo separa automáticamente.
   */
  const fileToTrack = async (f: ImportedFile, idx: number): Promise<Track> => {
    const fullName = f.relativePath ?? f.name;
    const baseName = fullName.split("/").pop()!.replace(/\.[^.]+$/, "");
    const trackId = `trk-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`;
    // Guardar en IndexedDB y obtener blob URL
    const blobUrl = await audioStore.saveFile(trackId, f.file);

    // Si el nombre del archivo tiene "artista - título", separarlos
    let title = baseName;
    let artist = "Artista desconocido";
    const dashIdx = baseName.indexOf(" - ");
    if (dashIdx > 0) {
      artist = baseName.substring(0, dashIdx).trim();
      title = baseName.substring(dashIdx + 3).trim();
    }

    return {
      id: trackId,
      title,
      artist,
      genre: undefined, // se puede editar manualmente después
      durationMs: 0,
      sourceUri: blobUrl,
      license: "Importado por el usuario",
    };
  };

  /**
   * Actualiza la duración de un track recién añadido tras leer la metadata
   * real del archivo de audio.
   */
  const updateTrackDuration = async (stationId: string, trackId: string, file: File) => {
    const durationMs = await readAudioDurationMs(file);
    if (durationMs > 0) {
      useLozkho.getState().updateStation(stationId, {
        playlist: useLozkho
          .getState()
          .stations.find((s) => s.id === stationId)
          ?.playlist.map((t) => (t.id === trackId ? { ...t, durationMs } : t)) ?? [],
      });
    }
  };

  const handleImportAudioFiles = async (files: ImportedFile[]) => {
    try {
    const audioFiles = files.filter(
      (f) =>
        f.type.startsWith("audio/") ||
        /\.(mp3|m4a|aac|flac|ogg|opus|wav|wma)$/i.test(f.name)
    );
    if (audioFiles.length === 0) {
      toast.error("No se encontraron archivos de audio", {
        description:
          "Comprueba que la carpeta o los archivos seleccionados contengan audio (MP3, M4A, FLAC, OGG, WAV, etc.).",
      });
      return;
    }
    const stationId = station ? station.id : "";
    // Detectar si vino de un directorio (algun archivo tiene relativePath)
    const fromDirectory = audioFiles.some((f) => f.relativePath);
    for (let i = 0; i < audioFiles.length; i++) {
      const f = audioFiles[i];
      const track = await fileToTrack(f, i);
      addTrackToStation(stationId, track);
      // Actualizar duración asíncronamente
      updateTrackDuration(stationId, track.id, f.file);
    }
    toast.success(`${audioFiles.length} pista(s) añadida(s)`, {
      description: `${
        fromDirectory
          ? `Importadas desde carpeta. `
          : ""
      }Total en playlist: ${
        (station?.playlist.length ?? 0) + audioFiles.length
      }. Archivos guardados localmente.`,
    });
    } catch (err) {
      console.error("Error en handleImportAudioFiles:", err);
      toast.error("Error al importar audio", {
        description: "Ocurrió un error inesperado. La app no se cerrará.",
      });
    }
  };

  const handleImportAdFiles = async (files: ImportedFile[]) => {
    const audioFiles = files.filter(
      (f) =>
        f.type.startsWith("audio/") ||
        /\.(mp3|m4a|aac|flac|ogg|opus|wav|wma)$/i.test(f.name)
    );
    if (audioFiles.length === 0) {
      toast.error("No se encontraron archivos de audio", {
        description:
          "Comprueba que la carpeta o los archivos seleccionados contengan audio (MP3, M4A, FLAC, OGG, WAV, etc.).",
      });
      return;
    }
    const stationId = station ? station.id : "";
    const fromDirectory = audioFiles.some((f) => f.relativePath);
    for (let i = 0; i < audioFiles.length; i++) {
      const f = audioFiles[i];
      const adId = `ad-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`;
      const blobUrl = await audioStore.saveFile(adId, f.file);
      const fullName = f.relativePath ?? f.name;
      const baseName = fullName.split("/").pop()!.replace(/\.[^.]+$/, "");
      const ad: Ad = {
        id: adId,
        title: baseName,
        sponsor: "Anunciante",
        durationMs: 15000,
        sourceUri: blobUrl,
        license: "Importado por el usuario",
      };
      addAdToStation(stationId, ad);
      // Actualizar duración asíncronamente
      readAudioDurationMs(f.file).then((durationMs) => {
        if (durationMs > 0) {
          useLozkho.getState().updateStation(stationId, {
            ads: useLozkho
              .getState()
              .stations.find((s) => s.id === stationId)
              ?.ads.map((a) => (a.id === adId ? { ...a, durationMs } : a)) ?? [],
          });
        }
      });
    }
    toast.success(`${audioFiles.length} anuncio(s) añadido(s)`, {
      description: `${
        fromDirectory ? `Importados desde carpeta. ` : ""
      }Total: ${(station?.ads.length ?? 0) + audioFiles.length}. Archivos guardados localmente.`,
    });
  };

  // Restricción: con 3 o más emisoras, solo se permite importar
  // una canción a la vez (sin selección múltiple ni carpetas).
  // Esto evita problemas de memoria en Tauri cuando hay muchas
  // emisoras con muchos archivos de audio simultáneos.
  const isLimited = stations.length >= 3;

  // Hook para importar pistas de audio
  const { pick: pickAudio, input: audioInput } = useFileImport(
    "audio/*,.mp3,.m4a,.aac,.flac,.ogg,.opus,.wav,.wma",
    handleImportAudioFiles,
    { singleMode: isLimited }
  );

  // Hook para importar anuncios
  const { pick: pickAd, input: adInput } = useFileImport(
    "audio/*,.mp3,.m4a,.aac,.flac,.ogg,.opus,.wav,.wma",
    handleImportAdFiles,
    { singleMode: isLimited }
  );

  // El estado de inputs manuales se resetea naturalmente al cerrar porque
  // desmontamos el contenido cuando `station` es null. Si necesitas resetear
  // sin cerrar, puedes usar el botón "Limpiar" dentro de cada formulario.

  if (!station) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md bg-black border-white/10">
          <p className="text-sm text-white/65">No hay emisora seleccionada.</p>
        </DialogContent>
      </Dialog>
    );
  }

  const accent = station.colors.accent;
  const accent2 = station.colors.accent2;
  const cycle = computeCycleDurationMs(station);

  // Mutadores locales que delegan al store
  const patch = (p: Partial<Station>) => updateStation(station.id, p);

  const handlePickThumbnail = () => {
    if (thumbnailInputRef.current) {
      thumbnailInputRef.current.value = "";
      thumbnailInputRef.current.click();
    }
  };

  const handleThumbnailFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Archivo no válido", {
        description: "Solo se aceptan imágenes (JPG, PNG, WebP, GIF).",
      });
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.warning("Imagen grande", {
        description: "Más de 4 MB. Recomendado: < 500 KB.",
      });
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      patch({ thumbnailUri: dataUri });
      toast.success("Miniatura actualizada", {
        description: `${file.name} (${formatBytes(file.size)})`,
      });
    };
    reader.onerror = () =>
      toast.error("Error al leer la imagen", {
        description: "No se pudo procesar el archivo.",
      });
    reader.readAsDataURL(file);
  };

  const handleAddTrackManual = () => {
    if (!newTrackTitle.trim()) {
      toast.error("Falta el título de la pista");
      return;
    }
    const t: Track = {
      id: `trk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: newTrackTitle.trim(),
      artist: newTrackArtist.trim() || "Desconocido",
      genre: undefined,
      durationMs: 60000,
      sourceUri: "",
      license: "Añadido manualmente",
    };
    addTrackToStation(station.id, t);
    setNewTrackTitle("");
    setNewTrackArtist("");
    toast.success(`Pista añadida: ${t.title}`);
  };

  const handleAddAdManual = () => {
    if (!newAdTitle.trim()) {
      toast.error("Falta el título del anuncio");
      return;
    }
    const ad: Ad = {
      id: `ad-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: newAdTitle.trim(),
      sponsor: newAdSponsor.trim() || "Anunciante",
      durationMs: 15000,
      sourceUri: "",
      license: "Añadido manualmente",
    };
    addAdToStation(station.id, ad);
    setNewAdTitle("");
    setNewAdSponsor("");
    toast.success(`Anuncio añadido: ${ad.title}`);
  };

  const handleDuplicate = () => {
    const newId = duplicateStation(station.id);
    toast.success("Emisora duplicada", {
      description: "Se creó una copia independiente.",
    });
    onOpenChange(false);
    setActiveStation(newId);
  };

  const handleDelete = () => {
    if (stations.length <= 1) {
      toast.error("No se puede eliminar", {
        description: "Debe existir al menos una emisora.",
      });
      return;
    }
    // Confirmación nativa (en la app nativa será un diálogo accesible)
    if (!confirm(`¿Eliminar la emisora "${station.name}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    deleteStation(station.id);
    toast.success("Emisora eliminada", { description: station.name });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-black border-white/10 max-h-[92vh] overflow-y-auto lozkho-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Pencil size={16} className="text-sky-300" />
            {mode === "create" ? "Crear emisora" : "Editar emisora"}
          </DialogTitle>
          <DialogDescription className="text-white/65">
            Edita todos los aspectos de la emisora: identidad, apariencia,
            playlist y anuncios. Los cambios se aplican en tiempo real.
          </DialogDescription>
        </DialogHeader>

        {mode === "create" && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-3 flex items-start gap-2 mb-2">
            <AlertTriangle size={14} className="text-emerald-300 mt-0.5 shrink-0" />
            <p className="text-[11px] text-emerald-100/85 leading-snug">
              <strong>Nueva emisora creada.</strong> Configúrala a continuación.
              Aún no tiene pistas; impórtalas en la pestaña «Playlist».
            </p>
          </div>
        )}

        <Tabs defaultValue="identidad" className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-white/5 border border-white/10 h-auto">
            <TabsTrigger value="identidad" className="text-[11px] py-2">
              <Type size={12} className="mr-1" /> Identidad
            </TabsTrigger>
            <TabsTrigger value="apariencia" className="text-[11px] py-2">
              <ImageIcon size={12} className="mr-1" /> Apariencia
            </TabsTrigger>
            <TabsTrigger value="playlist" className="text-[11px] py-2">
              <Music size={12} className="mr-1" /> Playlist
            </TabsTrigger>
            <TabsTrigger value="anuncios" className="text-[11px] py-2">
              <Megaphone size={12} className="mr-1" /> Anuncios
            </TabsTrigger>
          </TabsList>

          {/* --- Identidad --- */}
          <TabsContent value="identidad" className="mt-4 space-y-3">
            <Field label="Nombre de la emisora">
              <Input
                value={station.name}
                onChange={(e) => patch({ name: e.target.value.slice(0, 32) })}
                maxLength={32}
                className="bg-white/5 border-white/10"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Banda">
                <Select
                  value={station.band}
                  onValueChange={(v) =>
                    patch({ band: v as Band, frequency: station.frequency })
                  }
                >
                  <SelectTrigger className="bg-white/5 border-white/10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FM">FM</SelectItem>
                    <SelectItem value="AM">AM</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Frecuencia">
                <Input
                  value={station.frequency}
                  onChange={(e) => patch({ frequency: e.target.value })}
                  inputMode="decimal"
                  className="bg-white/5 border-white/10 freq-display"
                />
              </Field>
            </div>
            <Field label="Eslogan / subtítulo">
              <Textarea
                value={station.slogan}
                onChange={(e) => patch({ slogan: e.target.value.slice(0, 120) })}
                rows={2}
                maxLength={120}
                className="bg-white/5 border-white/10 resize-none"
              />
            </Field>
            <Field label="Etiqueta de estado de ánimo (mood)">
              <Input
                value={station.mood}
                onChange={(e) => patch({ mood: e.target.value.slice(0, 24) })}
                maxLength={24}
                className="bg-white/5 border-white/10"
              />
            </Field>
          </TabsContent>

          {/* --- Apariencia --- */}
          <TabsContent value="apariencia" className="mt-4 space-y-4">
            {/* Vista previa */}
            <div
              className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center"
              style={{
                background: `radial-gradient(ellipse at 50% 0%, ${hexToRgba(accent, 0.25)} 0%, transparent 70%), ${hexToRgba(accent2, 0.12)}`,
              }}
            >
              <p className="text-[10px] uppercase tracking-widest text-white/45 mb-1">
                Vista previa
              </p>
              <div className="flex items-center justify-center gap-3">
                <div
                  className="w-14 h-14 rounded-2xl overflow-hidden bg-cover bg-center shrink-0 vinyl-spin"
                  style={
                    station.thumbnailUri
                      ? { backgroundImage: `url(${station.thumbnailUri})` }
                      : { background: gradientThumbnail(accent, accent2) }
                  }
                  aria-hidden
                />
                <div className="text-left min-w-0">
                  <p
                    className="text-2xl font-bold truncate"
                    style={{
                      fontFamily: getFontFamily(station.titleFont),
                      color: station.titleColor ?? "#ffffff",
                      textShadow: `0 0 16px ${hexToRgba(
                        station.titleColor ?? accent,
                        0.35
                      )}`,
                    }}
                  >
                    {station.name || "Nombre emisora"}
                  </p>
                  <p
                    className="freq-display text-sm font-bold"
                    style={{ color: accent }}
                  >
                    {station.frequency} {station.band}
                  </p>
                </div>
              </div>
              <p className="text-[10px] italic text-white/55 mt-2">
                “{station.slogan}”
              </p>
            </div>

            {/* Paleta */}
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-widest text-white/55">
                Paleta de colores
              </Label>
              <div className="grid grid-cols-6 gap-2">
                {PALETTE_PRESETS.map((p) => {
                  const active =
                    station.colors.accent.toLowerCase() === p.a.toLowerCase();
                  return (
                    <button
                      key={p.name}
                      onClick={() => patch({ colors: { accent: p.a, accent2: p.a2 } })}
                      aria-label={`Aplicar paleta ${p.name}`}
                      className="aspect-square rounded-xl border-2 transition active:scale-90"
                      style={{
                        background: gradientThumbnail(p.a, p.a2),
                        borderColor: active ? "#fff" : "transparent",
                        boxShadow: active
                          ? `0 0 0 2px ${hexToRgba(p.a, 0.5)}`
                          : undefined,
                      }}
                    />
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <Field label="Acento principal">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={station.colors.accent}
                      onChange={(e) =>
                        patch({ colors: { accent: e.target.value, accent2: station.colors.accent2 } })
                      }
                      aria-label="Color principal"
                      className="w-10 h-10 rounded-lg bg-transparent border border-white/15 cursor-pointer"
                    />
                    <span className="freq-display text-xs text-white/70">
                      {station.colors.accent.toUpperCase()}
                    </span>
                  </div>
                </Field>
                <Field label="Acento secundario">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={station.colors.accent2}
                      onChange={(e) =>
                        patch({ colors: { accent: station.colors.accent, accent2: e.target.value } })
                      }
                      aria-label="Color secundario"
                      className="w-10 h-10 rounded-lg bg-transparent border border-white/15 cursor-pointer"
                    />
                    <span className="freq-display text-xs text-white/70">
                      {station.colors.accent2.toUpperCase()}
                    </span>
                  </div>
                </Field>
              </div>
            </div>

            <Separator className="bg-white/10" />

            {/* Tipografía del título */}
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-widest text-white/55">
                Tipografía del título
              </Label>
              <Select
                value={station.titleFont}
                onValueChange={(v) => patch({ titleFont: v as FontKey })}
              >
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FONT_CATALOG.map((f) => (
                    <SelectItem key={f.key} value={f.key}>
                      <span
                        style={{ fontFamily: f.cssFamily }}
                        className="text-base mr-2 inline-block"
                      >
                        {f.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-white/55 leading-snug">
                {FONT_CATALOG.find((f) => f.key === station.titleFont)?.description}
              </p>
              <Field label="Color del título">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => patch({ titleColor: null })}
                    className={`px-2 py-1 rounded-lg text-[10px] uppercase tracking-widest border ${
                      station.titleColor === null
                        ? "border-white bg-white/10 text-white"
                        : "border-white/15 text-white/65 bg-white/5"
                    }`}
                  >
                    Heredar (blanco)
                  </button>
                  {[
                    "#ffffff",
                    "#000000",
                    ...PALETTE_PRESETS.slice(0, 8).map((p) => p.a),
                  ].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => patch({ titleColor: c })}
                      aria-label={`Color ${c}`}
                      className={`w-6 h-6 rounded-full border-2 ${
                        station.titleColor === c ? "border-white" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <input
                    type="color"
                    value={station.titleColor ?? station.colors.accent}
                    onChange={(e) => patch({ titleColor: e.target.value })}
                    aria-label="Color personalizado"
                    className="w-9 h-9 rounded-lg bg-transparent border border-white/15 cursor-pointer"
                  />
                </div>
              </Field>
            </div>

            <Separator className="bg-white/10" />

            {/* Miniatura */}
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-widest text-white/55">
                Miniatura de la emisora
              </Label>
              <div className="flex items-center gap-3">
                <div
                  className="w-20 h-20 rounded-2xl overflow-hidden bg-cover bg-center shrink-0 border border-white/10 vinyl-spin"
                  style={
                    station.thumbnailUri
                      ? { backgroundImage: `url(${station.thumbnailUri})` }
                      : { background: gradientThumbnail(accent, accent2) }
                  }
                  aria-hidden
                >
                  {!station.thumbnailUri && (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-black/70" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-white/80 leading-snug">
                    {station.thumbnailUri ? (
                      <><strong className="text-white">Imagen importada.</strong></>
                    ) : (
                      <><strong className="text-white">Sin imagen.</strong> Gradiente de paleta.</>
                    )}
                  </p>
                  <p className="text-[10px] text-white/45 mt-1 leading-snug">
                    JPG, PNG, WebP, GIF. Recomendado: 512×512 px, &lt; 500 KB.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={thumbnailInputRef}
                  type="file"
                  accept="image/*,.jpg,.jpeg,.png,.webp,.gif"
                  onChange={handleThumbnailFile}
                  className="hidden"
                  aria-hidden
                  tabIndex={-1}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePickThumbnail}
                  className="bg-white/5 border-white/15 text-white hover:bg-white/10 hover:text-white"
                >
                  <Upload size={14} className="mr-1" />{" "}
                  {station.thumbnailUri ? "Cambiar imagen" : "Importar imagen"}
                </Button>
                {station.thumbnailUri && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      patch({ thumbnailUri: null });
                      toast.info("Miniatura eliminada");
                    }}
                    className="bg-white/5 border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
                  >
                    <Trash2 size={14} className="mr-1" /> Quitar
                  </Button>
                )}
              </div>
            </div>
          </TabsContent>

          {/* --- Playlist --- */}
          <TabsContent value="playlist" className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-white/55">
                  Pistas en la playlist
                </p>
                <p className="text-base font-bold text-white">
                  {station.playlist.length}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => pickAudio("files")}
                  className="bg-sky-500 text-black hover:bg-sky-400"
                >
                  <Upload size={12} className="mr-1" />{" "}
                  {isLimited ? "Importar canción" : "Importar audio"}
                </Button>
                {!isLimited && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => pickAudio("directory")}
                    className="bg-white/5 border-white/15 text-white hover:bg-white/10 hover:text-white"
                    title="Importar un directorio completo (con subcarpetas). Lee recursivamente todos los archivos de audio soportados."
                  >
                    <Folder size={12} className="mr-1" /> Importar carpeta
                  </Button>
                )}
                {audioInput}
              </div>
              {isLimited && (
                <p className="text-[10px] text-amber-300/80 leading-snug">
                  Tienes 3+ emisoras: importación limitada a una canción por
                  vez para evitar problemas de memoria.
                </p>
              )}
            </div>

            {/* Añadir pista manual */}
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2">
              <p className="text-[11px] uppercase tracking-widest text-white/55">
                Añadir pista manualmente
              </p>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Título"
                  value={newTrackTitle}
                  onChange={(e) => setNewTrackTitle(e.target.value)}
                  className="bg-white/5 border-white/10 h-8 text-[12px]"
                />
                <Input
                  placeholder="Artista"
                  value={newTrackArtist}
                  onChange={(e) => setNewTrackArtist(e.target.value)}
                  className="bg-white/5 border-white/10 h-8 text-[12px]"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddTrackManual}
                  className="h-8 bg-white/10 text-white hover:bg-white/20 border border-white/15"
                >
                  <Plus size={12} />
                </Button>
              </div>
            </div>

            {/* Lista de pistas */}
            {station.playlist.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.02] p-4 text-center">
                <Music size={20} className="mx-auto text-white/40 mb-2" />
                <p className="text-[12px] text-white/55">
                  La playlist está vacía. Importa audio o añade pistas manualmente.
                </p>
              </div>
            ) : (
              <div className="space-y-1 max-h-[40vh] overflow-y-auto lozkho-scroll pr-1">
                {station.playlist.map((t, i) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-2"
                  >
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          reorderPlaylist(station.id, i, Math.max(0, i - 1))
                        }
                        disabled={i === 0}
                        aria-label="Subir"
                        className="text-white/40 hover:text-white disabled:opacity-25"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          reorderPlaylist(
                            station.id,
                            i,
                            Math.min(station.playlist.length - 1, i + 1)
                          )
                        }
                        disabled={i === station.playlist.length - 1}
                        aria-label="Bajar"
                        className="text-white/40 hover:text-white disabled:opacity-25"
                      >
                        <ChevronDown size={12} />
                      </button>
                    </div>
                    <span className="text-[10px] freq-display text-white/40 w-5 text-right">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-white truncate">
                        {t.title}
                      </p>
                      <p className="text-[10px] text-white/55 truncate">
                        {t.artist}
                        {t.genre ? ` · ${t.genre}` : ""}
                        {" · "}
                        <span className="freq-display">
                          {formatClock(t.durationMs)}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        removeTrackFromStation(station.id, t.id);
                        toast.info(`Pista eliminada: ${t.title}`);
                      }}
                      aria-label="Eliminar pista"
                      className="text-rose-300/70 hover:text-rose-300 p-1 rounded"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* --- Anuncios --- */}
          <TabsContent value="anuncios" className="mt-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-white/55">
                  Anuncios en la emisora
                </p>
                <p className="text-base font-bold text-white">
                  {station.ads.length}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => pickAd("files")}
                  className="bg-amber-500 text-black hover:bg-amber-400"
                >
                  <Upload size={12} className="mr-1" />{" "}
                  {isLimited ? "Importar anuncio" : "Importar anuncio"}
                </Button>
                {!isLimited && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => pickAd("directory")}
                    className="bg-white/5 border-white/15 text-white hover:bg-white/10 hover:text-white"
                    title="Importar un directorio completo de anuncios (con subcarpetas)."
                  >
                    <Folder size={12} className="mr-1" /> Importar carpeta
                  </Button>
                )}
                {adInput}
              </div>
            </div>

            <Field
              label={`Insertar un anuncio cada ${station.adEvery} pista(s)`}
            >
              <Slider
                value={[station.adEvery]}
                min={1}
                max={6}
                step={1}
                onValueChange={(v) => patch({ adEvery: v[0] })}
              />
            </Field>
            <p className="text-[11px] text-white/55 leading-snug">
              Duración estimada de una vuelta completa del ciclo (pistas + anuncios):{" "}
              <span className="font-semibold" style={{ color: accent }}>
                {formatDurationLong(cycle)}
              </span>
            </p>

            {/* Añadir anuncio manual */}
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2">
              <p className="text-[11px] uppercase tracking-widest text-white/55">
                Añadir anuncio manualmente
              </p>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Título"
                  value={newAdTitle}
                  onChange={(e) => setNewAdTitle(e.target.value)}
                  className="bg-white/5 border-white/10 h-8 text-[12px]"
                />
                <Input
                  placeholder="Anunciante"
                  value={newAdSponsor}
                  onChange={(e) => setNewAdSponsor(e.target.value)}
                  className="bg-white/5 border-white/10 h-8 text-[12px]"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddAdManual}
                  className="h-8 bg-white/10 text-white hover:bg-white/20 border border-white/15"
                >
                  <Plus size={12} />
                </Button>
              </div>
            </div>

            {station.ads.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/15 bg-white/[0.02] p-4 text-center">
                <Megaphone size={20} className="mx-auto text-white/40 mb-2" />
                <p className="text-[12px] text-white/55">
                  Sin anuncios. La emisora solo reproducirá música en bucle.
                </p>
              </div>
            ) : (
              <div className="space-y-1 max-h-[30vh] overflow-y-auto lozkho-scroll pr-1">
                {station.ads.map((a, i) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-2"
                  >
                    <span className="text-[10px] freq-display text-amber-300/60 w-5 text-right">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-white truncate">
                        {a.title}
                      </p>
                      <p className="text-[10px] text-amber-300/70 truncate">
                        {a.sponsor}
                        {" · "}
                        <span className="freq-display">
                          {formatClock(a.durationMs)}
                        </span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        removeAdFromStation(station.id, a.id);
                        toast.info(`Anuncio eliminado: ${a.title}`);
                      }}
                      aria-label="Eliminar anuncio"
                      className="text-rose-300/70 hover:text-rose-300 p-1 rounded"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="outline"
              onClick={handleDuplicate}
              className="bg-white/5 border-white/15 text-white hover:bg-white/10 hover:text-white"
            >
              <Copy size={14} className="mr-1" /> Duplicar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleDelete}
              className="bg-rose-500/10 border-rose-500/40 text-rose-300 hover:bg-rose-500/20 hover:text-rose-200"
            >
              <Trash2 size={14} className="mr-1" /> Eliminar
            </Button>
          </div>
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="bg-sky-500 text-black hover:bg-sky-400 w-full sm:w-auto"
          >
            <X size={14} className="mr-1" /> Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] text-white/60">{label}</Label>
      {children}
    </div>
  );
}
