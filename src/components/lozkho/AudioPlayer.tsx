"use client";

import { useEffect, useRef, useCallback } from "react";
import { useLozkho, useActiveStation, buildExtendedPlaylist } from "@/lozkho/store";
import type { Station } from "@/lozkho/types";

/**
 * Reproductor de audio real para Lozkho Stereo.
 *
 * DISEÑO:
 * - El reloj virtual (tickClock en PrototypeShell) avanza TODAS las emisoras.
 * - Para la emisora ACTIVA con audio real (blob: URLs), el reloj virtual se
 *   sincroniza con la posición real del <audio> vía onTimeUpdate.
 * - Cuando el <audio> termina (onEnded), se avanza al siguiente item.
 * - NO hay setInterval de sincronización (eso causaba un bucle de feedback
 *   entre el reloj virtual y el audio real, resultando en loops de 3 segundos).
 *
 * El problema anterior era:
 *   1. tickClock avanza positionMs cada 500ms basado en wall clock
 *   2. setInterval del AudioPlayer leía positionMs (stale) y lo reseteaba
 *      a audio.currentTime si difería en >2s
 *   3. Esto creaba un ciclo: tickClock avanza → AudioPlayer resetea →
 *      tickClock avanza → AudioPlayer resetea → loop infinito
 *
 * Solución: usar onTimeUpdate (evento del <audio>) para sincronizar
 * positionMs con la posición real. Esto es reactivo, no un polling.
 */
export function AudioPlayer() {
  const station = useActiveStation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stationIdRef = useRef<string | null>(null);
  const currentItemIndexRef = useRef<number>(0);

  // Sincronizar el <audio> con la pista actual de la emisora activa
  useEffect(() => {
    if (!station) return;
    const audio = audioRef.current;
    if (!audio) return;

    const extended = buildExtendedPlaylist(station);
    if (extended.length === 0) return;

    const currentIdx = station.playback.currentItemIndex % extended.length;
    const current = extended[currentIdx];
    if (!current) return;

    // Si cambió el índice del item, actualizar refs
    if (stationIdRef.current !== station.id || currentItemIndexRef.current !== currentIdx) {
      stationIdRef.current = station.id;
      currentItemIndexRef.current = currentIdx;
    }

    if (current.kind === "track") {
      const track = station.playlist.find((t) => t.id === current.ref.id);
      const uri = track?.sourceUri ?? "";
      // Solo reproducir si es un blob: URL (archivo importado real)
      // o una URL http/https remota
      const isPlayable = uri.startsWith("blob:") || uri.startsWith("http");

      if (isPlayable) {
        // Solo cambiar src si es diferente (evita reiniciar reproducción)
        const currentSrc = audio.src;
        if (currentSrc !== uri) {
          audio.src = uri;
          audio.currentTime = station.playback.positionMs / 1000;
          audio.play().catch((err) => {
            if (err.name === "NotAllowedError") {
              console.info("Autoplay bloqueado. Haz clic en la ventana para activar el audio.");
            } else {
              console.warn("Error al reproducir:", err);
            }
          });
        }
      } else {
        // Pista demo sin audio real: silenciar el <audio>
        if (audio.src) {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        }
      }
    } else {
      // Es un anuncio: silenciar audio (los anuncios demo no tienen audio real)
      if (audio.src) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
    }
  }, [
    station?.id,
    station?.playback.currentItemIndex,
    station?.playlist,
    station?.ads,
  ]);

  // Cuando el audio termina, avanzar al siguiente item
  const handleEnded = useCallback(() => {
    const st = useLozkho.getState();
    const activeStation = st.stations.find((s) => s.id === st.activeStationId);
    if (!activeStation) return;

    const extended = buildExtendedPlaylist(activeStation);
    if (extended.length === 0) return;

    const nextIndex = (activeStation.playback.currentItemIndex + 1) % extended.length;
    st.updateStation(activeStation.id, {
      playback: {
        ...activeStation.playback,
        currentItemIndex: nextIndex,
        positionMs: 0,
        lastTickAt: Date.now(),
        isAd: extended[nextIndex]?.kind === "ad",
      },
    });
  }, []);

  // Sincronizar el reloj virtual con la posición real del audio.
  // Esto es REACTIVO (evento del <audio>), no un polling con setInterval.
  // Solo actualiza si la diferencia es > 1s para no saturar el store.
  const handleTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audio.paused || !isFinite(audio.currentTime)) return;

    const st = useLozkho.getState();
    const activeStation = st.stations.find((s) => s.id === st.activeStationId);
    if (!activeStation) return;

    const realPosMs = Math.round(audio.currentTime * 1000);
    const virtualPosMs = activeStation.playback.positionMs;

    // Solo sincronizar si la diferencia es significativa (> 1.5s)
    // Esto evita sobreescribir el reloj virtual constantemente
    if (Math.abs(realPosMs - virtualPosMs) > 1500) {
      st.updateStation(activeStation.id, {
        playback: {
          ...activeStation.playback,
          positionMs: realPosMs,
          lastTickAt: Date.now(),
        },
      });
    }
  }, []);

  if (!station) return null;

  return (
    <>
      <audio
        ref={audioRef}
        onEnded={handleEnded}
        onTimeUpdate={handleTimeUpdate}
        preload="auto"
        style={{ display: "none" }}
      />
      <AutoplayUnlock />
    </>
  );
}

/**
 * Desbloquea el audio tras la primera interacción del usuario.
 * Los navegadores (y WebView de Tauri) bloquean autoplay hasta que
 * hay una interacción (click, touch, keypress).
 */
function AutoplayUnlock() {
  useEffect(() => {
    let unlocked = false;
    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      // Crear un AudioContext silencioso para desbloquear el audio
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          if (ctx.state === "suspended") {
            ctx.resume().catch(() => {});
          }
        }
      } catch {
        // Si falla, no pasa nada
      }
      // También intentar reproducir cualquier <audio> existente
      const audios = document.querySelectorAll("audio");
      audios.forEach((a) => {
        if (a.src && a.paused) {
          a.play().catch(() => {});
        }
      });
      window.removeEventListener("click", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
  return null;
}
