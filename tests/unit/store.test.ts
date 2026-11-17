import { describe, expect, test } from "bun:test";
import {
  useLozkho,
  buildExtendedPlaylist,
  computeCycleDurationMs,
} from "../../src/lozkho/store";
import type { Station } from "../../src/lozkho/types";

function makeStation(lastTickAt: number, positionMs: number, durationMs = 60_000): Station {
  return {
    id: "st-test",
    name: "Emisora test",
    titleFont: "geist",
    titleColor: null,
    thumbnailUri: null,
    band: "FM",
    frequency: "100.0",
    mood: "Test",
    slogan: "",
    colors: { accent: "#F59E0B", accent2: "#7C2D12" },
    thumbnail: "gradient:amber",
    playlist: [
      {
        id: "t1",
        title: "Pista 1",
        artist: "Artista",
        durationMs,
        sourceUri: "https://lozkho.local/ABC",
      },
    ],
    ads: [],
    adEvery: 2,
    playOrder: "import",
    playback: {
      currentItemIndex: 0,
      positionMs,
      lastTickAt,
      running: true,
      isAd: false,
    },
  };
}

describe("tickClock — persistencia del punto de reproducción", () => {
  test("avanza positionMs según el delta del tick", () => {
    const now = 1_000_000;
    useLozkho.setState({ stations: [makeStation(now - 500, 0)] });
    useLozkho.getState().tickClock(now);
    const st = useLozkho.getState().stations[0];
    expect(st.playback.positionMs).toBe(500);
    expect(st.playback.currentItemIndex).toBe(0);
  });

  test("un delta de horas se capa a un ciclo y NO salta cientos de pistas", () => {
    const now = 10_000_000;
    // lastTickAt de hace 3 horas (típico al reabrir la app)
    useLozkho.setState({ stations: [makeStation(now - 3 * 3600_000, 15_000)] });
    useLozkho.getState().tickClock(now);
    const st = useLozkho.getState().stations[0];
    expect(computeCycleDurationMs(st)).toBe(60_000);
    // 15s + 60s (cap) = 75s → da una vuelta y vuelve a 15s
    expect(st.playback.positionMs).toBe(15_000);
    // Sigue sonando la misma pista (el playlist extendido duplica la vuelta)
    const extended = buildExtendedPlaylist(st);
    expect(extended[st.playback.currentItemIndex]?.ref.id).toBe("t1");
  });

  test("la emisora activa con audio real NO avanza con el reloj virtual (lo hace <audio>)", () => {
    const now = 1_000_000;
    const st = makeStation(now - 60_000, 10_000); // canción de 60s, ya a 10s
    useLozkho.setState({ stations: [st], activeStationId: st.id });
    // Un tick de 60s debería saltar de pista si el reloj virtual la moviera
    useLozkho.getState().tickClock(now);
    const after = useLozkho.getState().stations[0];
    expect(after.playback.currentItemIndex).toBe(0);
    expect(after.playback.positionMs).toBe(10_000);
    expect(after.playback.lastTickAt).toBe(now - 60_000);
  });

  test("pistas con durationMs=0 usan mínimo de 30s y no ciclan sin control", () => {
    const now = 10_000_000;
    useLozkho.setState({ stations: [makeStation(now - 24 * 3600_000, 0, 0)] });
    useLozkho.getState().tickClock(now);
    const st = useLozkho.getState().stations[0];
    expect(st.playback.positionMs).toBeGreaterThanOrEqual(0);
    expect(st.playback.positionMs).toBeLessThanOrEqual(60_000);
    expect(st.playback.currentItemIndex).toBeGreaterThanOrEqual(0);
  });
});

describe("buildExtendedPlaylist", () => {
  test("duplica la playlist para el bucle infinito", () => {
    const st = makeStation(Date.now(), 0);
    expect(buildExtendedPlaylist(st).length).toBe(2);
  });
});
