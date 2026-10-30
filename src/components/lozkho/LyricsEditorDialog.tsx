"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Pencil,
  Search,
  Trash2,
  Unlink,
  Save,
  X,
  Loader2,
  Music,
} from "lucide-react";
import { toast } from "sonner";
import { useLozkho } from "@/lozkho/store";
import { parseLRC, buildLRC } from "@/lozkho/lrc";
import type { StationLyrics, Track } from "@/lozkho/types";

interface LyricsEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Letra actualmente cargada en el LyricsPanel. */
  lyrics: StationLyrics;
  /** Pista actual (para mostrar contexto + re-link en caso de "no es de esta canción"). */
  track: Track;
  /** ID de la emisora activa (para link/unlink lyrics al track). */
  stationId: string;
  /** Color de acento de la emisora (para chips/badges). */
  accent: string;
}

type Tab = "edit" | "search";

/**
 * Diálogo modal para editar / reemplazar / desvincular las letras de la
 * pista que está sonando.
 *
 * Cubre 3 escenarios del usuario:
 *  1. "La letra está equivocada, quiero corregirla"  → pestaña Editar
 *  2. "Quiero buscar otra letra en LRCLIB"            → pestaña Buscar
 *  3. "Esta letra no es de esta canción, quítala"     → botón Desvincular
 */
export function LyricsEditorDialog({
  open,
  onOpenChange,
  lyrics,
  track,
  stationId,
  accent,
}: LyricsEditorDialogProps) {
  const updateLyrics = useLozkho((s) => s.updateLyrics);
  const removeLyrics = useLozkho((s) => s.removeLyrics);
  const linkLyricsToTrack = useLozkho((s) => s.linkLyricsToTrack);

  const [tab, setTab] = useState<Tab>("edit");
  const [draft, setDraft] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Para la pestaña "Buscar online"
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<
    Array<{
      id: string;
      trackName: string;
      artistName?: string;
      duration?: number;
      syncedLyrics?: string;
      plainLyrics?: string;
      source: string;
    }>
  >([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Inicializar draft al abrir
  useEffect(() => {
    if (open) {
      setDraft(buildLRC(lyrics));
      setIsDirty(false);
      setTab("edit");
      setSearchResults([]);
      setHasSearched(false);
    }
  }, [open, lyrics.id]); // no dependemos de lyrics completa para no resetear en cada tick

  // Detectar cambios manuales
  const handleDraftChange = (v: string) => {
    setDraft(v);
    setIsDirty(v !== buildLRC(lyrics));
  };

  const handleSave = () => {
    const parsed = parseLRC(draft, track.title, track.artist, "local");
    if (!parsed) {
      toast.error(
        "No se detectaron líneas con timestamp [mm:ss.xx]. Revisa el formato LRC."
      );
      return;
    }
    setIsSaving(true);
    try {
      // Mantener el mismo id y matchKey (para no romper links existentes),
      // pero reemplazar contenido y metadatos del LRC editado.
      updateLyrics(lyrics.id, {
        title: parsed.title,
        artist: parsed.artist ?? lyrics.artist,
        offsetMs: parsed.offsetMs || 0,
        lines: parsed.lines,
        license: parsed.license,
        source: "local", // al editar manualmente, deja de ser "online"
      });
      // Asegurar el link track → lyrics (puede que viniera de heurística)
      if (track.lyricsId !== lyrics.id) {
        linkLyricsToTrack(stationId, track.id, lyrics.id);
      }
      toast.success("Letra actualizada.", {
        description: `${parsed.lines.length} líneas · ${
          parsed.title
        }${parsed.artist ? " — " + parsed.artist : ""}`,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast.error("No se pudo guardar la letra: " + (e?.message ?? "error"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleUnlink = () => {
    // Solo desvincular el track de la letra; NO borrar la letra del catálogo
    // porque puede estar en uso por otras pistas (o ser re-buscada después).
    linkLyricsToTrack(stationId, track.id, undefined);
    toast.success("Letra desvinculada de esta pista.", {
      description:
        "La letra sigue en tu colección. Si otras pistas la usan, no se ven afectadas.",
    });
    onOpenChange(false);
  };

  const handleUnlinkAndDelete = () => {
    if (
      !window.confirm(
        "¿Eliminar esta letra de tu colección?\n\nSi otras pistas la usan, también perderán la letra. Esta acción no se puede deshacer."
      )
    ) {
      return;
    }
    removeLyrics(lyrics.id);
    toast.success("Letra eliminada de tu colección.");
    onOpenChange(false);
  };

  const handleSearch = async () => {
    setSearching(true);
    setHasSearched(true);
    setSearchResults([]);
    try {
      const params = new URLSearchParams();
      params.set("track_name", track.title);
      if (track.artist) params.set("artist_name", track.artist);
      const res = await fetch(
        `https://lrclib.net/api/search?${params.toString()}`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) {
        toast.error("LRCLIB respondió con error. Intenta más tarde.");
        return;
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        toast.info("Sin resultados en LRCLIB para esta pista.");
        return;
      }
      // Priorizar resultados con syncedLyrics
      const sorted = [...data].sort((a: any, b: any) => {
        const aSync = a.syncedLyrics ? 1 : 0;
        const bSync = b.syncedLyrics ? 1 : 0;
        if (aSync !== bSync) return bSync - aSync;
        // Si ambos sincronizados o ambos no, priorizar duración cercana
        const targetDur = track.durationMs / 1000;
        const aDiff = a.duration ? Math.abs(a.duration - targetDur) : 9999;
        const bDiff = b.duration ? Math.abs(b.duration - targetDur) : 9999;
        return aDiff - bDiff;
      });
      setSearchResults(
        sorted.slice(0, 8).map((r: any, i: number) => ({
          id: `${r.id ?? i}-${i}`,
          trackName: r.trackName ?? track.title,
          artistName: r.artistName,
          duration: r.duration,
          syncedLyrics: r.syncedLyrics,
          plainLyrics: r.plainLyrics,
          source: r.syncedLyrics ? "LRCLIB (synced)" : "LRCLIB (plain)",
        }))
      );
    } catch (e) {
      toast.error("No se pudo conectar con LRCLIB.");
    } finally {
      setSearching(false);
    }
  };

  const handleApplySearchResult = (r: (typeof searchResults)[number]) => {
    const raw = r.syncedLyrics || r.plainLyrics;
    if (!raw) {
      toast.error("Esta entrada no tiene contenido.");
      return;
    }
    const parsed = parseLRC(raw, r.trackName, r.artistName, "online");
    if (!parsed) {
      toast.error("El contenido no tiene timestamps válidos.");
      return;
    }
    // Reemplazar la letra existente (mismo id) con la nueva versión online.
    updateLyrics(lyrics.id, {
      title: parsed.title,
      artist: parsed.artist ?? r.artistName,
      offsetMs: parsed.offsetMs || 0,
      lines: parsed.lines,
      license: `${r.source} — aplicada manualmente`,
      source: "online",
    });
    if (track.lyricsId !== lyrics.id) {
      linkLyricsToTrack(stationId, track.id, lyrics.id);
    }
    toast.success(`Letra reemplazada: ${parsed.title}`, {
      description: `${parsed.lines.length} líneas · ${r.source}`,
    });
    onOpenChange(false);
  };

  const lineCount = useMemo(
    () => draft.split(/\r?\n/).filter((l) => l.trim()).length,
    [draft]
  );
  const validTsCount = useMemo(
    () =>
      draft
        .split(/\r?\n/)
        .filter((l) => /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/.test(l)).length,
    [draft]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 bg-zinc-950 border-white/15"
        style={{
          ["--station-accent" as any]: accent,
        }}
      >
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/10">
          <DialogTitle className="text-white flex items-center gap-2 text-base">
            <Pencil size={16} style={{ color: accent }} />
            Editar letra
          </DialogTitle>
          <DialogDescription className="text-white/60 text-xs">
            Para la pista{" "}
            <span className="text-white/90 font-medium">{track.title}</span>
            {track.artist ? (
              <>
                {" — "}
                <span className="text-white/70">{track.artist}</span>
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-white/10 px-2 gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setTab("edit")}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition border-b-2 ${
              tab === "edit"
                ? "border-[var(--station-accent)] text-white"
                : "border-transparent text-white/50 hover:text-white/80"
            }`}
          >
            <Pencil size={12} /> Editar LRC
          </button>
          <button
            type="button"
            onClick={() => setTab("search")}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition border-b-2 ${
              tab === "search"
                ? "border-[var(--station-accent)] text-white"
                : "border-transparent text-white/50 hover:text-white/80"
            }`}
          >
            <Search size={12} /> Buscar online
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-5 py-4 lozkho-scroll">
          {tab === "edit" ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-[11px] text-white/50">
                  Pega o edita el contenido LRC. Cada línea debe llevar un
                  timestamp <code className="text-white/70">[mm:ss.xx]</code>.
                </p>
                <div className="flex items-center gap-3 text-[10px] font-mono text-white/40">
                  <span>{lineCount} líneas</span>
                  <span>{validTsCount} con timestamp</span>
                </div>
              </div>
              <Textarea
                value={draft}
                onChange={(e) => handleDraftChange(e.target.value)}
                spellCheck={false}
                className="font-mono text-xs leading-relaxed min-h-[50vh] resize-none bg-black/40 border-white/15 text-white/90"
                placeholder={
                  "[ti:Título de la canción]\n[ar:Artista]\n[00:08.00] Primera línea\n[00:12.50] Segunda línea\n..."
                }
              />
              {isDirty ? (
                <p className="text-[11px] text-amber-400/80">
                  ● Cambios sin guardar
                </p>
              ) : (
                <p className="text-[11px] text-white/30">
                  Sin cambios respecto a la letra actual
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleSearch}
                  disabled={searching}
                  className="gap-1.5"
                >
                  {searching ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Search size={14} />
                  )}
                  Buscar en LRCLIB
                </Button>
                <span className="text-[11px] text-white/40">
                  Busca por{" "}
                  <span className="text-white/70">{track.title}</span>
                  {track.artist ? (
                    <>
                      {" "}
                      + <span className="text-white/70">{track.artist}</span>
                    </>
                  ) : null}
                </span>
              </div>

              {!hasSearched ? (
                <div className="text-center py-12 text-white/40 text-sm">
                  <Music
                    size={32}
                    className="mx-auto mb-2 opacity-30"
                    style={{ color: accent }}
                  />
                  Pulsa <strong className="text-white/70">Buscar en LRCLIB</strong>
                  {" "}para encontrar letras alternativas online.
                </div>
              ) : searching ? (
                <div className="text-center py-12 text-white/50 text-sm">
                  <Loader2 size={24} className="mx-auto mb-2 animate-spin" />
                  Buscando...
                </div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-12 text-white/40 text-sm">
                  Sin resultados. Prueba con la pestaña <strong className="text-white/70">Editar LRC</strong>{" "}
                  para pegar manualmente otra letra.
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {searchResults.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-lg border border-white/10 bg-white/[0.03] p-3 hover:bg-white/[0.06] transition"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white/90 font-medium truncate">
                            {r.trackName}
                          </p>
                          <p className="text-[11px] text-white/50 truncate">
                            {r.artistName ?? "Artista desconocido"}
                            {r.duration
                              ? ` · ${Math.floor(r.duration / 60)}:${String(
                                  r.duration % 60
                                ).padStart(2, "0")}`
                              : ""}
                          </p>
                        </div>
                        <span className="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border border-white/15 text-white/60 shrink-0">
                          {r.syncedLyrics ? "Synced" : "Plain"}
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleApplySearchResult(r)}
                        className="mt-2 h-7 text-[11px] gap-1.5"
                      >
                        <Save size={12} /> Reemplazar letra actual
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Footer con acciones */}
        <DialogFooter className="px-5 py-3 border-t border-white/10 flex items-center justify-between gap-2 bg-black/40 shrink-0">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleUnlink}
              className="text-white/60 hover:text-white hover:bg-white/10 gap-1.5 h-8"
              title="Quita la letra de esta pista sin borrarla de tu colección"
            >
              <Unlink size={13} /> Desvincular
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleUnlinkAndDelete}
              className="text-rose-300/80 hover:text-rose-300 hover:bg-rose-500/10 gap-1.5 h-8"
              title="Elimina la letra de tu colección (afecta a todas las pistas que la usan)"
            >
              <Trash2 size={13} /> Eliminar
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-white/60 hover:text-white h-8 gap-1.5"
            >
              <X size={14} /> Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              className="gap-1.5 h-8"
              style={{ backgroundColor: accent, color: "#000" }}
            >
              {isSaving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              Guardar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
