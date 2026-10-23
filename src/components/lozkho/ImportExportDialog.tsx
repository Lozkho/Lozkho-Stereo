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
  Upload,
  Download,
  Check,
  AlertTriangle,
} from "lucide-react";
import { useState } from "react";
import { useFileImport, formatBytes, type ImportedFile } from "@/lozkho/useFileImport";

export interface ImportExportFormat {
  id: string;
  label: string;
  description: string;
  /** Extensiones que se aceptarán al importar. */
  accept?: string;
}

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
   * Callback al confirmar exportación. Recibe el formato elegido. En el
   * prototipo, no se genera el archivo realmente (solo se muestra un resumen).
   */
  onExport?: (formatId: string) => void;
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

  const reset = () => {
    setPickMode("files");
    setFormat(formats[0]?.id ?? "");
    setPickedFiles([]);
  };

  const close = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  const handleConfirmExport = () => {
    onExport?.(format);
    close(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md bg-black border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            {mode === "import" ? (
              <Upload size={16} className="text-sky-300" />
            ) : (
              <Download size={16} className="text-emerald-300" />
            )}
            {mode === "import" ? "Importar" : "Exportar"} {kindLabel}
          </DialogTitle>
          <DialogDescription className="text-white/65">
            {mode === "import"
              ? `Selecciona archivos o un directorio para importar ${kindLabel}. En la app nativa se conservarán referencias persistentes a cada archivo.`
              : `Elige el formato de exportación para tus ${kindLabel}. Los archivos se generarán en el directorio de descargas del dispositivo.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Formato */}
          <div className="space-y-2">
            <Label className="text-[11px] uppercase tracking-widest text-white/55">
              Formato
            </Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger className="bg-white/5 border-white/10">
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
                  className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 cursor-pointer hover:bg-white/[0.05] transition"
                >
                  <RadioGroupItem
                    value="files"
                    id={`pick-files-${kindLabel}`}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="flex items-center gap-1.5 text-[12px] font-semibold text-white">
                      <FileText size={12} /> Archivos
                    </div>
                    <p className="text-[10px] text-white/55 leading-snug mt-0.5">
                      Selecciona uno o varios archivos sueltos.
                    </p>
                  </div>
                </label>
                <label
                  htmlFor={`pick-dir-${kindLabel}`}
                  className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 cursor-pointer hover:bg-white/[0.05] transition"
                >
                  <RadioGroupItem
                    value="directory"
                    id={`pick-dir-${kindLabel}`}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="flex items-center gap-1.5 text-[12px] font-semibold text-white">
                      <Folder size={12} /> Directorio
                    </div>
                    <p className="text-[10px] text-white/55 leading-snug mt-0.5">
                      Importa todo un directorio (con subcarpetas).
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

          {/* Lista de archivos seleccionados */}
          {mode === "import" && pickedFiles.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2 max-h-44 overflow-y-auto lozkho-scroll">
              <p className="text-[10px] uppercase tracking-widest text-white/45 mb-1 px-1">
                {pickedFiles.length} archivo(s) · {formatBytes(
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
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => close(false)}
            className="bg-white/5 border-white/15 text-white hover:bg-white/10 hover:text-white"
          >
            Cancelar
          </Button>
          {mode === "import" ? (
            <Button
              disabled={pickedFiles.length === 0}
              onClick={() => {
                onImport?.(pickedFiles, format);
                close(false);
              }}
              className="bg-sky-500 text-black hover:bg-sky-400 disabled:opacity-40 disabled:hover:bg-sky-500"
            >
              <Check size={14} className="mr-1" />
              Importar {pickedFiles.length > 0 ? `(${pickedFiles.length})` : ""}
            </Button>
          ) : (
            <Button
              onClick={handleConfirmExport}
              className="bg-emerald-500 text-black hover:bg-emerald-400"
            >
              <Download size={14} className="mr-1" />
              Exportar
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
  const { pick, input } = useFileImport(accept, onPicked);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => pick(pickMode)}
        className="w-full bg-white/5 border-white/15 text-white hover:bg-white/10 hover:text-white"
      >
        {pickMode === "files" ? (
          <FileText size={14} className="mr-2" />
        ) : (
          <Folder size={14} className="mr-2" />
        )}
        Elegir {pickMode === "files" ? "archivos" : "directorio"} de{" "}
        {kindLabel}
      </Button>
      {input}
      {pickedFiles.length === 0 && (
        <p className="text-[10px] text-white/40 leading-snug text-center">
          No se ha seleccionado nada todavía.
        </p>
      )}
    </>
  );
}
