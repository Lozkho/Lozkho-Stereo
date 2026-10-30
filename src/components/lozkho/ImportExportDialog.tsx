"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FileText,
  Folder,
  FolderOpen,
  Upload,
  Download,
  Check,
  AlertTriangle,
  HardDrive,
  Info,
} from "lucide-react";
import { useState } from "react";
import { useFileImport, formatBytes, type ImportedFile } from "@/lozkho/useFileImport";
import {
  canPickDirectory,
  pickDirectory,
  type FsDirHandle,
} from "@/lozkho/fsAccess";

export interface ImportExportFormat {
  id: string;
  label: string;
  description: string;
  /** Extensiones que se aceptarán al importar. */
  accept?: string;
  /** Extensión por defecto al exportar (sin punto). */
  defaultExt?: string;
}

/** Modo de destino para la exportación en PC con FS Access API. */
type ExportTarget = "directory" | "downloads";

export interface ImportExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tipo de operación. */
  mode: "import" | "export";
  /** Título corto: "canciones", "emisoras", "letras", "anuncios". */
  kindLabel: string;
  /** Lista de formatos soportados para esta operación. */
  formats: ImportExportFormat[];
  /** Texto explicativo sobre referencias persistentes y límites. */
  persistenceNote?: React.ReactNode;
  /**
   * Callback al confirmar importación. Recibe los archivos simulados y el
   * formato elegido. En el prototipo, los archivos no se almacenan realmente.
   */
  onImport?: (files: ImportedFile[], formatId: string) => void;
  /**
   * Callback al confirmar exportación.
   *
   * - Si targetDir es null, el navegador no soporta FS Access API y se debe
   *   usar la descarga tradicional (un único archivo, sugerido por el nombre).
   * - Si targetDir NO es null, el usuario eligió un directorio en PC. El
   *   callback debe escribir los archivos dentro de ese directorio usando
   *   `writeFileToDir` (de fsAccess).
   */
  onExport?: (
    formatId: string,
    targetDir: FsDirHandle | null,
    targetMode: ExportTarget
  ) => void | Promise<void>;
  /** Si la importación permite directorios (true) o solo archivos (false). */
  allowDirectory?: boolean;
}

export function ImportExportDialog({
  open,
  onOpenChange,
  mode,
  kindLabel,
  formats,
  persistenceNote,
  onImport,
  onExport,
  allowDirectory = true,
}: ImportExportDialogProps) {
  const [pickMode, setPickMode] = useState<"files" | "directory">("files");
  const [format, setFormat] = useState<string>(formats[0]?.id ?? "");
  const [pickedFiles, setPickedFiles] = useState<ImportedFile[]>([]);
  // Estado de exportación (PC con FS Access API)
  const [exportTarget, setExportTarget] = useState<ExportTarget>(
    canPickDirectory() ? "directory" : "downloads"
  );
  const [targetDir, setTargetDir] = useState<FsDirHandle | null>(null);
  const [exporting, setExporting] = useState(false);

  const supportsDirExport = canPickDirectory();

  // Reset al cerrar el diálogo (cuando open pasa a false).
  // No usamos useEffect con set* directo (lint: cascading renders).
  // En su lugar, el componente padre nos remonta con `key={open ? openId : 'closed'}`
  // cuando cambia el modo apertura/cierre. El cierre se maneja aquí limpiando
  // solo el estado transitorio en el handler onOpenChange.
  const close = (next: boolean) => {
    if (!next) {
      setPickedFiles([]);
      setTargetDir(null);
      setExporting(false);
    }
    onOpenChange(next);
  };

  const handlePickDir = async () => {
    const handle = await pickDirectory();
    if (handle) setTargetDir(handle);
  };

  const handleConfirmExport = async () => {
    if (exporting) return;
    // Resolver el directorio destino efectivo. Si el usuario eligió
    // "Carpeta elegida" pero no ha seleccionado ninguna todavía, abrir
    // el selector automáticamente. El handle recién obtenido se pasa
    // directamente a onExport() para evitar el re-render async de React
    // (setTargetDir no actualiza el closure actual).
    let effectiveDir = targetDir;
    if (exportTarget === "directory" && supportsDirExport && !effectiveDir) {
      const handle = await pickDirectory();
      if (handle) {
        effectiveDir = handle;
        setTargetDir(handle);
      } else {
        // El usuario canceló el selector; abortar la exportación.
        return;
      }
    }
    setExporting(true);
    try {
      await onExport?.(
        format,
        exportTarget === "directory" ? effectiveDir : null,
        exportTarget
      );
    } finally {
      setExporting(false);
      close(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="max-w-[95vw] sm:max-w-md bg-black border-white/10 max-h-[90vh] flex flex-col gap-4 p-6 overflow-hidden"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-white text-base sm:text-lg">
            {mode === "import" ? (
              <Upload size={16} className="text-sky-300 shrink-0" />
            ) : (
              <Download size={16} className="text-emerald-300 shrink-0" />
            )}
            {mode === "import" ? "Importar" : "Exportar"} {kindLabel}
          </DialogTitle>
          <DialogDescription className="text-white/65 text-xs sm:text-sm">
            {mode === "import"
              ? supportsDirExport
                ? `En PC, al elegir «Directorio» se abrirá el selector nativo de carpetas del sistema.`
                : `Selecciona archivos o un directorio para importar ${kindLabel}.`
              : `Elige el formato y destino de exportación para tus ${kindLabel}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-y-auto lozkho-scroll flex-1 pr-1 -mr-1">
          {/* Formato */}
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-widest text-white/55">
              Formato
            </Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger className="bg-white/5 border-white/10 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {formats.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {format && (
              <p className="text-[11px] text-white/55 leading-snug">
                {formats.find((f) => f.id === format)?.description}
              </p>
            )}
          </div>

          {/* Modo de selección (solo importar) */}
          {mode === "import" && allowDirectory && (
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-widest text-white/55">
                Origen
              </Label>
              <RadioGroup
                value={pickMode}
                onValueChange={(v) => setPickMode(v as "files" | "directory")}
                className="grid grid-cols-2 gap-2"
              >
                <label
                  htmlFor={`pick-files-${kindLabel}`}
                  className="flex items-start gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-2 cursor-pointer hover:bg-white/[0.05] transition"
                >
                  <RadioGroupItem
                    value="files"
                    id={`pick-files-${kindLabel}`}
                    className="mt-0.5 shrink-0"
                  />
                  <div>
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-white">
                      <FileText size={11} /> Archivos
                    </div>
                    <p className="text-[9px] text-white/55 leading-tight mt-0.5">
                      Selecciona uno o varios archivos.
                    </p>
                  </div>
                </label>
                <label
                  htmlFor={`pick-dir-${kindLabel}`}
                  className="flex items-start gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-2 cursor-pointer hover:bg-white/[0.05] transition"
                >
                  <RadioGroupItem
                    value="directory"
                    id={`pick-dir-${kindLabel}`}
                    className="mt-0.5 shrink-0"
                  />
                  <div>
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-white">
                      <Folder size={11} /> Directorio
                    </div>
                    <p className="text-[9px] text-white/55 leading-tight mt-0.5">
                      {supportsDirExport
                        ? "Carpeta nativa del sistema."
                        : "Importa todo un directorio."}
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>
          )}

          {/* Botón picker (importar) */}
          {mode === "import" && (
            <ImportPickerButton
              kindLabel={kindLabel}
              pickMode={pickMode}
              accept={formats.find((f) => f.id === format)?.accept ?? "*/*"}
              onPicked={setPickedFiles}
              pickedFiles={pickedFiles}
            />
          )}

          {/* Selector de destino (solo exportar) */}
          {mode === "export" && (
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-widest text-white/55">
                Destino
              </Label>
              {supportsDirExport ? (
                <RadioGroup
                  value={exportTarget}
                  onValueChange={(v) =>
                    setExportTarget(v as ExportTarget)
                  }
                  className="grid grid-cols-2 gap-2"
                >
                  <label
                    htmlFor={`exp-dir-${kindLabel}`}
                    className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 cursor-pointer hover:bg-white/[0.05] transition"
                  >
                    <RadioGroupItem
                      value="directory"
                      id={`exp-dir-${kindLabel}`}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-white">
                        <FolderOpen size={12} /> Carpeta elegida
                      </div>
                      <p className="text-[10px] text-white/55 leading-snug mt-0.5">
                        Selecciona una carpeta del sistema donde se guardarán los archivos.
                      </p>
                    </div>
                  </label>
                  <label
                    htmlFor={`exp-dl-${kindLabel}`}
                    className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 cursor-pointer hover:bg-white/[0.05] transition"
                  >
                    <RadioGroupItem
                      value="downloads"
                      id={`exp-dl-${kindLabel}`}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-white">
                        <HardDrive size={12} /> Descargas
                      </div>
                      <p className="text-[10px] text-white/55 leading-snug mt-0.5">
                        Descarga directa (uno o varios archivos desde el navegador).
                      </p>
                    </div>
                  </label>
                </RadioGroup>
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-white">
                    <HardDrive size={12} /> Descargas del navegador
                  </div>
                  <p className="text-[10px] text-white/55 leading-snug mt-0.5">
                    Este entorno no soporta selector de carpeta. Se usará la
                    carpeta de descargas configurada en el navegador.
                  </p>
                </div>
              )}

              {/* Botón elegir carpeta (solo si target=directory) */}
              {exportTarget === "directory" && supportsDirExport && (
                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePickDir}
                    className="w-full bg-white/5 border-white/15 text-white hover:bg-white/10 hover:text-white"
                  >
                    <FolderOpen size={14} className="mr-2" />
                    {targetDir ? (
                      <span className="truncate">
                        Carpeta: <strong className="text-emerald-300">{targetDir.name}</strong>
                      </span>
                    ) : (
                      "Elegir carpeta destino…"
                    )}
                  </Button>
                  {targetDir && (
                    <p className="text-[10px] text-emerald-300/85 leading-snug flex items-center gap-1">
                      <Check size={10} /> Los archivos se guardarán dentro de{" "}
                      <code className="font-mono">{targetDir.name}/</code>
                    </p>
                  )}
                  {!targetDir && (
                    <p className="text-[10px] text-white/45 leading-snug">
                      Aún no has elegido una carpeta. Si pulsas Exportar sin
                      elegir, se usará la carpeta de Descargas.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Lista de archivos seleccionados (importar) */}
          {mode === "import" && pickedFiles.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2 max-h-44 overflow-y-auto lozkho-scroll">
              <p className="text-[10px] uppercase tracking-widest text-white/45 mb-1 px-1">
                {pickedFiles.length} archivo(s) ·{" "}
                {formatBytes(
                  pickedFiles.reduce((a, b) => a + b.size, 0)
                )}
              </p>
              <ul className="space-y-0.5">
                {pickedFiles.slice(0, 8).map((f, i) => (
                  <li
                    key={i}
                    className="text-[11px] text-white/75 truncate font-mono"
                  >
                    {f.relativePath ?? f.name}
                  </li>
                ))}
                {pickedFiles.length > 8 && (
                  <li className="text-[10px] text-white/45 italic">
                    … y {pickedFiles.length - 8} más
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Nota de persistencia */}
          {persistenceNote && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3 flex gap-2">
              <AlertTriangle
                size={14}
                className="text-amber-300 mt-0.5 shrink-0"
              />
              <div className="text-[11px] text-amber-100/85 leading-snug">
                {persistenceNote}
              </div>
            </div>
          )}

          {/* Indicador de soporte FS Access API (PC) */}
          {mode === "export" && supportsDirExport && (
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/[0.06] p-2 flex gap-2">
              <Info size={12} className="text-sky-300 mt-0.5 shrink-0" />
              <p className="text-[11px] text-sky-100/85 leading-snug">
                Tu navegador soporta File System Access API. Puedes elegir
                cualquier carpeta del sistema y los archivos se escribirán
                directamente ahí, sin pasar por la carpeta de descargas.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 pt-1 border-t border-white/5">
          <Button
            variant="outline"
            onClick={() => close(false)}
            disabled={exporting}
            className="bg-white/5 border-white/15 text-white hover:bg-white/10 hover:text-white h-9 text-xs"
          >
            Cancelar
          </Button>
          {mode === "import" ? (
            <Button
              disabled={pickedFiles.length === 0}
              onClick={() => {
                try {
                  onImport?.(pickedFiles, format);
                } catch (err) {
                  console.error("Error en onImport:", err);
                }
                close(false);
              }}
              className="bg-sky-500 text-black hover:bg-sky-400 disabled:opacity-40 disabled:hover:bg-sky-500 h-9 text-xs"
            >
              <Check size={12} className="mr-1" />
              Importar {pickedFiles.length > 0 ? `(${pickedFiles.length})` : ""}
            </Button>
          ) : (
            <Button
              onClick={handleConfirmExport}
              disabled={exporting}
              className="bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-40 h-9 text-xs"
            >
              <Download size={14} className="mr-1" />
              {exporting ? "Exportando…" : "Exportar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportPickerButton({
  kindLabel,
  pickMode,
  accept,
  onPicked,
  pickedFiles,
}: {
  kindLabel: string;
  pickMode: "files" | "directory";
  accept: string;
  onPicked: (files: ImportedFile[]) => void;
  pickedFiles: ImportedFile[];
}) {
  const { pick, input, lastDirName } = useFileImport(accept, onPicked);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          // pick() es async en la nueva versión; ignoramos su resultado.
          void pick(pickMode);
        }}
        className="w-full bg-white/5 border-white/15 text-white hover:bg-white/10 hover:text-white h-9 text-xs"
      >
        {pickMode === "files" ? (
          <FileText size={12} className="mr-1.5 shrink-0" />
        ) : (
          <Folder size={12} className="mr-1.5 shrink-0" />
        )}
        <span className="truncate">
          Elegir {pickMode === "files" ? "archivos" : "directorio"} de {kindLabel}
        </span>
      </Button>
      {input}

      {/* Indicador de directorio elegido (solo modo directorio + PC con FS Access API) */}
      {pickMode === "directory" && lastDirName && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-2 flex gap-2">
          <Check size={12} className="text-emerald-300 mt-0.5 shrink-0" />
          <p className="text-[11px] text-emerald-100/85 leading-snug">
            Carpeta seleccionada:{" "}
            <code className="font-mono text-emerald-300">{lastDirName}/</code>
          </p>
        </div>
      )}

      {/* Indicador de soporte FS Access API (solo modo directorio) */}
      {pickMode === "directory" && canPickDirectory() && !lastDirName && (
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/[0.06] p-2 flex gap-2">
          <Info size={12} className="text-sky-300 mt-0.5 shrink-0" />
          <p className="text-[11px] text-sky-100/85 leading-snug">
            Al pulsar el botón se abrirá el selector nativo de carpetas del
            sistema. Podrás elegir cualquier carpeta local y la app leerá
            recursivamente todos sus archivos (M3U8, JSON, MP3, etc.).
          </p>
        </div>
      )}

      {/* Hint para Android/navegadores sin FS Access API */}
      {pickMode === "directory" && !canPickDirectory() && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-2 flex gap-2">
          <AlertTriangle
            size={12}
            className="text-amber-300 mt-0.5 shrink-0"
          />
          <p className="text-[11px] text-amber-100/85 leading-snug">
            Este entorno no soporta selector nativo de carpeta. Se usará el
            selector de documentos del sistema, que permite elegir una carpeta
            y leerá todos los archivos recursivamente.
          </p>
        </div>
      )}

      {pickedFiles.length === 0 && !lastDirName && (
        <p className="text-[10px] text-white/40 leading-snug text-center">
          No se ha seleccionado nada todavía.
        </p>
      )}
    </>
  );
}
