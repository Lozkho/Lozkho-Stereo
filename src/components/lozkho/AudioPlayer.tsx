"use client";

import { useEffect, useRef, useCallback } from "react";
import { useLozkho, useActiveStation, buildExtendedPlaylist } from "@/lozkho/store";
import { lozkhoLog } from "@/lozkho/logger";
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
 * Comportamiento ante pistas no reproducibles:
 * - Si el sourceUri del track actual NO es blob: ni http(s):// (por ejemplo
 *   "demo:no-audio" o una ruta relativa "./audio/foo.mp3" que no se pudo
 *   resolver), el reproductor SALTA automáticamente a la siguiente pista
 *   después de 500ms. Esto evita que la emisora se quede "atascada" en una
 *   pista silenciosa mostrando el reloj avanzar sin sonido.
 *
 * Manejo de errores de audio.play():
 * - AbortError: ocurre cuando se cambia audio.src mientras un play()
 *   anterior está pendiente. Es COMPORTAMIENTO NORMAL (no es un error real)
 *   — NO se debe auto-saltar la pista.
 * - NotAllowedError: autoplay bloqueado por el navegador. Se reintenta
 *   la reproducción al detectar la primera interacción del usuario.
 * - Otros errores (NotSupportedError, MediaErrDecode): sí se auto-salta
 *   tras 1.5s porque indican que la pista está corrupta o no soportada.
 *
 * IMPORTANTE: el bug previo trataba AbortError como error real y saltaba
 * la pista, lo que provocaba el ciclo "avanza canciones indefinidamente"
 * al seleccionar una emisora importada.
 */
export function AudioPlayer() {
  const station = useActiveStation();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stationIdRef = useRef<string | null>(null);
  const currentItemIndexRef = useRef<number>(0);
  // Para detectar pistas atascadas (sin audio reproducible)
  const stuckTimerRef = useRef<number | null>(null);
  // Token de carga: cuando cambiamos audio.src, incrementamos este número.
  // Cualquier callback async (canplay, error, etc.) verifica si su token
  // sigue siendo el actual antes de actuar. Esto evita que callbacks de
  // una carga anterior interfieran con la carga actual.
  const loadTokenRef = useRef<number>(0);
  // Indica si ya hemos llamado a play() para la pista actual y está
  // pendiente o reproduciéndose. Evita llamadas duplicadas.
  const playAttemptedRef = useRef<boolean>(false);
  // Indica si el usuario ya ha interactuado (para desbloquear autoplay).
  const userInteractedRef = useRef<boolean>(false);

  // Helper: avanza a la siguiente pista en la emisora activa
  const skipToNext = useCallback(() => {
    const st = useLozkho.getState();
    const activeStation = st.stations.find((s) => s.id === st.activeStationId);
    if (!activeStation) return;
    const extended = buildExtendedPlaylist(activeStation);
    if (extended.length === 0) return;
    const nextIndex =
      (activeStation.playback.currentItemIndex + 1) % extended.length;
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

  // Detectar la primera interacción del usuario para desbloquear autoplay.
  // En Android WebView (TWA), el audio está bloqueado hasta que el usuario
  // toca la pantalla. Registramos esto para saber cuándo podemos reintentar
  // la reproducción de pistas que se quedaron en NotAllowedError.
  useEffect(() => {
    const markInteracted = () => {
      if (userInteractedRef.current) return;
      userInteractedRef.current = true;
      // Reintentar reproducción de la pista actual si el audio está pausado.
      const audio = audioRef.current;
      if (audio && audio.src && audio.paused) {
        audio.play().catch((err) => {
          if (err.name !== "AbortError" && err.name !== "NotAllowedError") {
            console.warn("[AudioPlayer] Error al reintentar tras interacción:", err);
          }
        });
      }
    };
    window.addEventListener("click", markInteracted);
    window.addEventListener("touchstart", markInteracted);
    window.addEventListener("keydown", markInteracted);
    return () => {
      window.removeEventListener("click", markInteracted);
      window.removeEventListener("touchstart", markInteracted);
      window.removeEventListener("keydown", markInteracted);
    };
  }, []);

  // Sincronizar el <audio> con la pista actual de la emisora activa
  useEffect(() => {
    if (!station) return;
    const audio = audioRef.current;
    if (!audio) return;

    // Limpiar timer de "pista atascada" anterior (si lo había)
    if (stuckTimerRef.current !== null) {
      window.clearTimeout(stuckTimerRef.current);
      stuckTimerRef.current = null;
    }

    const extended = buildExtendedPlaylist(station);
    if (extended.length === 0) return;

    const currentIdx = station.playback.currentItemIndex % extended.length;
    const current = extended[currentIdx];
    if (!current) return;

    const idxChanged =
      stationIdRef.current !== station.id ||
      currentItemIndexRef.current !== currentIdx;
    if (idxChanged) {
      stationIdRef.current = station.id;
      currentItemIndexRef.current = currentIdx;
      playAttemptedRef.current = false;
    }

    if (current.kind === "track") {
      const track = station.playlist.find((t) => t.id === current.ref.id);
      const uri = track?.sourceUri ?? "";
      // Solo reproducir si es blob:, http(s)://, o lozkho.local (Android streaming)
      const isPlayable = uri.startsWith("blob:") || uri.startsWith("http") || uri.includes("lozkho.local");

      if (isPlayable) {
        lozkhoLog.debug(`AudioPlayer: cargando track "${track?.title}"`, {
          id: track?.id,
          uri: uri.slice(0, 60) + (uri.length > 60 ? "…" : ""),
          idx: currentIdx,
        });
        // Solo cambiar src si es diferente (evita reiniciar reproducción).
        // Comparar con el atributo src actual (no con dataset) para que
        // las URLs blob: restauradas de IndexedDB (que cambian en cada
        // sesión) sí disparen una recarga.
        const currentSrc = audio.src;
        // Normalizar: si currentSrc es "" o "undefined", tratar como null.
        const normalizedCurrentSrc =
          currentSrc && currentSrc !== "undefined" ? currentSrc : null;

        if (normalizedCurrentSrc !== uri) {
          // Incrementar token: cualquier callback de la carga anterior
          // se descartará al ver que su token ya no es el actual.
          const myToken = ++loadTokenRef.current;
          audio.src = uri;
          // Forzar recarga del elemento con la nueva fuente
          audio.load();
          // Resetear la bandera de play intentado para esta carga
          playAttemptedRef.current = false;
          // Poner la posición actual del reloj virtual
          try {
            audio.currentTime = station.playback.positionMs / 1000;
          } catch {
            // currentTime puede lanzar si el metadata no está cargado aún
          }

          // Esperar al evento 'canplay' para llamar play(). Esto evita
          // el race condition donde play() rechaza con AbortError porque
          // el elemento está procesando la nueva fuente.
          const onCanPlay = () => {
            if (loadTokenRef.current !== myToken) return; // carga obsoleta
            if (playAttemptedRef.current) return; // ya se intentó
            playAttemptedRef.current = true;
            audio
              .play()
              .then(() => {
                // Reproducción iniciada correctamente
              })
              .catch((err) => {
                if (loadTokenRef.current !== myToken) return; // obsoleto
                if (err.name === "AbortError") {
                  // Normal cuando cambia src mientras play() está pendiente.
                  // NO es un error real — no saltar la pista.
                  console.info(
                    "[AudioPlayer] play() abortado (cambio de src), ignorando"
                  );
                  // Resetear para que se pueda reintentar
                  playAttemptedRef.current = false;
                  return;
                }
                if (err.name === "NotAllowedError") {
                  // Autoplay bloqueado. Se reintentará cuando el usuario
                  // interactúe (ver useEffect que escucha click/touch).
                  console.info(
                    "[AudioPlayer] Autoplay bloqueado, esperando interacción"
                  );
                  playAttemptedRef.current = false;
                  return;
                }
                // Otros errores (NotSupportedError, MediaErrDecode, etc.)
                // sí indican que la pista no se puede reproducir.
                console.warn("[AudioPlayer] Error al reproducir:", err);
                stuckTimerRef.current = window.setTimeout(() => {
                  console.warn(
                    `[AudioPlayer] Saltando pista con error de carga: "${track?.title}"`
                  );
                  skipToNext();
                }, 1500);
              });
          };
          audio.addEventListener("canplay", onCanPlay, { once: true });

          // Fallback: si 'canplay' no llega en 2s, intentar play() de
          // todos modos (algunos formatos nunca disparan canplay).
          window.setTimeout(() => {
            if (loadTokenRef.current !== myToken) return;
            if (playAttemptedRef.current) return;
            // Disparar manualmente el handler
            onCanPlay();
          }, 2000);
        } else if (!playAttemptedRef.current) {
          // Misma src pero no se ha intentado reproducir todavía:
          // probablemente estamos volviendo a esta pista tras una
          // interacción del usuario que desbloqueó el autoplay.
          playAttemptedRef.current = true;
          audio.play().catch((err) => {
            if (err.name === "AbortError" || err.name === "NotAllowedError") {
              playAttemptedRef.current = false;
              return;
            }
            console.warn("[AudioPlayer] Error al reintentar:", err);
          });
        }
      } else {
        // Pista NO reproducible (demo, ruta relativa sin resolver, o
        // "demo:no-audio"): silenciar el <audio>.
        // CRÍTICO: NO saltar pistas demo (content://lozkho.demo/...) —
        // son pistas virtuales sin audio real. Deben "reproducirse"
        // silenciosamente por su duración usando el reloj virtual.
        if (audio.src) {
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
        }
        const isDemo = uri.startsWith("content://lozkho.demo/") ||
          uri === "demo:no-audio" || !uri;
        if (isDemo) {
          lozkhoLog.debug(`AudioPlayer: pista demo silenciosa "${track?.title}" (uri: ${uri})`);
        } else {
          // Pista que debería tener audio pero no se resolvió: saltar tras 3s
          lozkhoLog.warn(
            `AudioPlayer: track no reproducible, saltará en 3s: "${track?.title}"`,
            { uri, trackId: track?.id }
          );
          stuckTimerRef.current = window.setTimeout(() => {
            lozkhoLog.info(`AudioPlayer: saltando track "${track?.title}" tras 3s sin audio`);
            skipToNext();
          }, 3000);
        }
      }
    } else {
      // Es un anuncio: silenciar audio (los anuncios demo no tienen audio real)
      if (audio.src) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      // Si el anuncio tampoco tiene audio real, saltar tras 1s
      const adTrack = station.ads.find((a) => a.id === current.ref.id);
      const adUri = adTrack?.sourceUri ?? "";
      const adPlayable =
        adUri.startsWith("blob:") || adUri.startsWith("http") || adUri.includes("lozkho.local");
      if (!adPlayable) {
        stuckTimerRef.current = window.setTimeout(() => {
          skipToNext();
        }, 1000);
      }
    }
  }, [
    station?.id,
    station?.playback.currentItemIndex,
    station?.playlist,
    station?.ads,
    skipToNext,
  ]);

  // Limpiar timer al desmontar
  useEffect(() => {
    return () => {
      if (stuckTimerRef.current !== null) {
        window.clearTimeout(stuckTimerRef.current);
        stuckTimerRef.current = null;
      }
    };
  }, []);

  // Cuando el audio termina, avanzar al siguiente item
  const handleEnded = useCallback(() => {
    skipToNext();
  }, [skipToNext]);

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
 * Los navegadores (y WebView de Tauri/Android TWA) bloquean autoplay
 * hasta que hay una interacción (click, touch, keypress).
 */
function AutoplayUnlock() {
  useEffect(() => {
    let unlocked = false;
    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      // Crear un AudioContext silencioso para desbloquear el audio
      try {
        const AudioCtx =
          window.AudioContext || (window as any).webkitAudioContext;
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
