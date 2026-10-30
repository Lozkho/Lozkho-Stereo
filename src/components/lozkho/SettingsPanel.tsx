"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
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
import { Separator } from "@/components/ui/separator";
import { useLozkho, useActiveStation, computeCycleDurationMs } from "@/lozkho/store";
import { formatDurationLong, gradientThumbnail, hexToRgba } from "@/lozkho/format";
import { FONT_CATALOG, getFontFamily } from "@/lozkho/fonts";
import type { FontKey } from "@/lozkho/types";
import { Palette, Radio, Music, Sliders, FileText, Info, Type, Image as ImageIcon, Trash2, Upload, Pencil, Copy } from "lucide-react";
import { toast } from "sonner";
import { useRef, useState } from "react";
import { StationEditor } from "@/components/lozkho/StationEditor";

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export function SettingsPanel({ open, onOpenChange }: SettingsPanelProps) {
  const station = useActiveStation();
  const {
    setStationName,
    setStationFrequency,
    setStationMood,
    setStationSlogan,
    setStationColors,
    setStationAdEvery,
    setStationPlayOrder,
    setStationTitleFont,
    setStationTitleColor,
    setStationThumbnail,
  } = useLozkho();

  // Hook para importar miniatura (archivo único de imagen)
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
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
        description:
          "El archivo pesa más de 4 MB. Se recomienda reducirlo antes de importar para no inflar la base de datos.",
      });
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUri = reader.result as string;
      setStationThumbnail(dataUri);
      toast.success("Miniatura actualizada", {
        description: `Importada: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`,
      });
    };
    reader.onerror = () => {
      toast.error("Error al leer la imagen", {
        description: "No se pudo procesar el archivo. Intenta con otro.",
      });
    };
    reader.readAsDataURL(file);
  };

  // Editor completo de emisora (modal con pestañas para playlist, anuncios, etc.)
  const [editorOpen, setEditorOpen] = useState(false);

  if (!station) return null;
  const cycle = computeCycleDurationMs(station);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md bg-black border-white/10 overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sliders size={16} /> Ajustes de la emisora
          </SheetTitle>
          <SheetDescription>
            Modifica en vivo los parámetros visuales y de programación. Los
            cambios se aplican al prototipo y se conservan durante la sesión.
            En la app nativa estos valores se persistirán localmente.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {/* Identidad */}
          <Section icon={<Radio size={14} />} title="Identidad">
            <Field label="Nombre">
              <Input
                value={station.name}
                onChange={(e) => setStationName(e.target.value)}
                maxLength={32}
                className="bg-white/5 border-white/10"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Banda">
                <Select
                  value={station.band}
                  onValueChange={(v) =>
                    setStationFrequency(station.frequency, v as "FM" | "AM")
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
                  onChange={(e) =>
                    setStationFrequency(e.target.value, station.band)
                  }
                  inputMode="decimal"
                  className="bg-white/5 border-white/10 freq-display"
                />
              </Field>
            </div>
            <Field label="Eslogan / subtítulo">
              <Textarea
                value={station.slogan}
                onChange={(e) => setStationSlogan(e.target.value)}
                rows={2}
                maxLength={120}
                className="bg-white/5 border-white/10 resize-none"
              />
            </Field>
            <Field label="Etiqueta de estado de ánimo (mood)">
              <Input
                value={station.mood}
                onChange={(e) => setStationMood(e.target.value)}
                maxLength={24}
                className="bg-white/5 border-white/10"
              />
            </Field>
          </Section>

          <Separator className="bg-white/10" />

          {/* Colores */}
          <Section icon={<Palette size={14} />} title="Paleta de colores">
            <div className="grid grid-cols-6 gap-2">
              {PALETTE_PRESETS.map((p) => {
                const active =
                  station.colors.accent.toLowerCase() === p.a.toLowerCase();
                return (
                  <button
                    key={p.name}
                    onClick={() => setStationColors(p.a, p.a2)}
                    aria-label={`Aplicar paleta ${p.name}`}
                    className="aspect-square rounded-xl border-2 transition active:scale-90"
                    style={{
                      background: gradientThumbnail(p.a, p.a2),
                      borderColor: active ? "#fff" : "transparent",
                      boxShadow: active ? `0 0 0 2px ${hexToRgba(p.a, 0.5)}` : undefined,
                    }}
                  />
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="Acento principal">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={station.colors.accent}
                    onChange={(e) =>
                      setStationColors(e.target.value, station.colors.accent2)
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
                      setStationColors(station.colors.accent, e.target.value)
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
            {/* Vista previa de miniatura */}
            <div className="mt-3 flex items-center gap-3">
              <div
                className="w-16 h-16 rounded-2xl vinyl-spin"
                style={{
                  background: gradientThumbnail(
                    station.colors.accent,
                    station.colors.accent2
                  ),
                }}
                aria-hidden
              />
              <p className="text-[11px] text-white/55 leading-snug">
                Vista previa de la miniatura tipo vinilo con la paleta actual.
                En la app nativa podrás sustituirla por una imagen importada
                (JPG/PNG/WebP) por emisora.
              </p>
            </div>
          </Section>

          <Separator className="bg-white/10" />

          {/* Tipografía del título */}
          <Section icon={<Type size={14} />} title="Tipografía del título">
            <div
              className="rounded-xl border border-white/10 bg-white/[0.03] p-4 mb-3 text-center"
              style={{
                ["--station-accent" as any]: station.titleColor ?? station.colors.accent,
              }}
            >
              <p className="text-[10px] uppercase tracking-widest text-white/45 mb-1">
                Vista previa
              </p>
              <p
                className="text-3xl font-bold truncate"
                style={{
                  fontFamily: getFontFamily(station.titleFont),
                  color: station.titleColor ?? "#ffffff",
                  textShadow: `0 0 18px ${hexToRgba(
                    station.titleColor ?? station.colors.accent,
                    0.35
                  )}`,
                }}
              >
                {station.name || "Nombre emisora"}
              </p>
            </div>

            <Field label="Fuente tipográfica">
              <Select
                value={station.titleFont}
                onValueChange={(v) => setStationTitleFont(v as FontKey)}
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
            </Field>
            <p className="text-[11px] text-white/55 leading-snug mt-1">
              {FONT_CATALOG.find((f) => f.key === station.titleFont)?.description}
            </p>

            <Field label="Color del título">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setStationTitleColor(null)}
                  className={`px-2 py-1 rounded-lg text-[10px] uppercase tracking-widest border ${
                    station.titleColor === null
                      ? "border-white bg-white/10 text-white"
                      : "border-white/15 text-white/65 bg-white/5"
                  }`}
                >
                  Usar acento
                </button>
                {/* Paleta rápida */}
                {[
                  "#ffffff",
                  "#000000",
                  ...PALETTE_PRESETS.slice(0, 8).map((p) => p.a),
                ].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setStationTitleColor(c)}
                    aria-label={`Color ${c}`}
                    className={`w-6 h-6 rounded-full border-2 ${
                      station.titleColor === c
                        ? "border-white"
                        : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={station.titleColor ?? station.colors.accent}
                  onChange={(e) => setStationTitleColor(e.target.value)}
                  aria-label="Color personalizado del título"
                  className="w-9 h-9 rounded-lg bg-transparent border border-white/15 cursor-pointer"
                />
                {station.titleColor && (
                  <span className="freq-display text-[11px] text-white/70">
                    {station.titleColor.toUpperCase()}
                  </span>
                )}
              </div>
            </Field>
          </Section>

          <Separator className="bg-white/10" />

          {/* Miniatura de la emisora */}
          <Section icon={<ImageIcon size={14} />} title="Miniatura de la emisora">
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-20 h-20 rounded-2xl overflow-hidden bg-cover bg-center shrink-0 border border-white/10 vinyl-spin"
                style={
                  station.thumbnailUri
                    ? { backgroundImage: `url(${station.thumbnailUri})` }
                    : {
                        background: gradientThumbnail(
                          station.colors.accent,
                          station.colors.accent2
                        ),
                      }
                }
                aria-hidden
              >
                {/* Agujero del vinilo SIEMPRE visible */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-black/70 ring-2 ring-white/20" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] text-white/80 leading-snug">
                  {station.thumbnailUri ? (
                    <>
                      <strong className="text-white">Imagen importada.</strong>{" "}
                      La miniatura se muestra en la pantalla de emisora, en el
                      dock y en la lista.
                    </>
                  ) : (
                    <>
                      <strong className="text-white">Sin imagen.</strong> Se
                      muestra un gradiente con la paleta de la emisora.
                    </>
                  )}
                </p>
                <p className="text-[10px] text-white/45 mt-1 leading-snug">
                  Formatos: JPG, PNG, WebP, GIF. Recomendado: 512×512 px, &lt;
                  500 KB.
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
                    setStationThumbnail(null);
                    toast.info("Miniatura eliminada", {
                      description: "Se vuelve a usar el gradiente de la paleta.",
                    });
                  }}
                  className="bg-white/5 border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
                >
                  <Trash2 size={14} className="mr-1" /> Quitar
                </Button>
              )}
            </div>
            <p className="text-[10px] text-white/40 mt-2 leading-snug">
              En la app nativa la imagen se almacenará en el directorio privado
              de la app y se referenciará por ruta, no como data URI. Esto evita
              inflar la base de datos.
            </p>
          </Section>

          <Separator className="bg-white/10" />

          {/* Comportamiento de reproducción (informativo) */}
          <Section icon={<Info size={14} />} title="Auto-reproducción continua">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[12px] text-white/80 leading-relaxed">
                <strong className="text-white">Auto-reproducción indefinida.</strong>{" "}
                Todas las emisoras se reproducen en simultáneo desde que abre la
                app. Solo la emisora <strong className="text-white">activa</strong>{" "}
                es audible (decodifica audio); las demás avanzan virtualmente en
                segundo plano.
              </p>
              <p className="text-[11px] text-white/55 leading-snug mt-2">
                No hay botón de pausa global: el reloj virtual de cada emisora
                avanza siempre. Al cambiar de emisora, la reproducción no se
                interrumpe — la nueva emisora continúa donde estaba y la anterior
                sigue en silencio.
              </p>
              <p className="text-[11px] text-white/45 leading-snug mt-2">
                En la app nativa, el sistema (MediaSession) podrá pausar
                temporalmente ante llamadas, auriculares desconectados o acciones
                del sistema; la app reanudará automáticamente cuando sea posible.
              </p>
            </div>
          </Section>

          <Separator className="bg-white/10" />

          {/* Programación de anuncios */}
          <Section icon={<FileText size={14} />} title="Programación de anuncios">
            <Field
              label={`Insertar un anuncio cada ${station.adEvery} pista(s)`}
            >
              <Slider
                value={[station.adEvery]}
                min={1}
                max={6}
                step={1}
                onValueChange={(v) => setStationAdEvery(v[0])}
              />
            </Field>
            <p className="text-[11px] text-white/55 leading-snug">
              Duración estimada de una vuelta completa (pistas + anuncios):{" "}
              <span className="font-semibold" style={{ color: station.colors.accent }}>
                {formatDurationLong(cycle)}
              </span>
            </p>
            <p className="text-[11px] text-white/40 leading-snug">
              Los anuncios se repiten indefinidamente; no hay límite de
              reproducción impuesto por la app.
            </p>

            <Separator className="bg-white/10 my-2" />

            <Field label="Orden de reproducción de pistas">
              <Select
                value={station.playOrder || "import"}
                onValueChange={(v) => setStationPlayOrder(v as any)}
              >
                <SelectTrigger className="bg-white/5 border-white/10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="import">Orden de importación</SelectItem>
                  <SelectItem value="alpha">Alfabético (A → Z)</SelectItem>
                  <SelectItem value="year">Por año (ascendente)</SelectItem>
                  <SelectItem value="artist">Por artista</SelectItem>
                  <SelectItem value="random">Aleatorio</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <p className="text-[11px] text-white/55 leading-snug">
              {station.playOrder === "alpha" && "Pistas ordenadas por título de la A a la Z."}
              {station.playOrder === "year" && "Pistas ordenadas por año de lanzamiento (las más antiguas primero)."}
              {station.playOrder === "artist" && "Pistas agrupadas por artista en orden alfabético."}
              {station.playOrder === "random" && "Orden aleatorio. Se mantiene estable hasta que cambies de emisora y vuelvas."}
              {(!station.playOrder || station.playOrder === "import") && "Orden en que las pistas fueron añadidas a la emisora."}
            </p>
          </Section>
        </div>

        <SheetFooter className="mt-6 flex-col gap-2">
          <Button
            onClick={() => {
              onOpenChange(false);
              setEditorOpen(true);
            }}
            className="bg-sky-500 text-black hover:bg-sky-400 w-full"
          >
            <Pencil size={14} className="mr-1" /> Abrir editor completo
          </Button>
          <p className="text-[10px] text-white/45 text-center leading-snug">
            El editor completo permite gestionar la playlist, los anuncios y
            duplicar/eliminar la emisora.
          </p>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-white/5 border-white/15 text-white hover:bg-white/10 hover:text-white w-full"
          >
            Cerrar
          </Button>
        </SheetFooter>
      </SheetContent>

      {/* Editor completo de emisora (modal con pestañas) */}
      <StationEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        stationId={station.id}
        mode="edit"
      />
    </Sheet>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-xs uppercase tracking-widest text-white/60 font-semibold">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] text-white/60">{label}</Label>
      {children}
    </div>
  );
}
