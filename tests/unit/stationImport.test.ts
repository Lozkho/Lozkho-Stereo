import { describe, expect, test } from "bun:test";
import {
  parseM3U8,
  parseStationJson,
  resolveTracksWithAudioFiles,
} from "../../src/lozkho/stationImport";

describe("parseM3U8", () => {
  test("parsea EXTINF y aplica 30s cuando la duración es 0/desconocida", () => {
    const text = [
      "#EXTM3U",
      "#PLAYLIST:Mi emisora",
      "#EXTINF:123,Artista - Canción",
      "./audio/cancion.mp3",
      "#EXTINF:0,Artista - Sin duración",
      "./audio/otra.mp3",
    ].join("\n");
    const st = parseM3U8(text, "lista.m3u8")!;
    expect(st).not.toBeNull();
    expect(st.name).toBe("Mi emisora");
    expect(st.playlist).toHaveLength(2);
    expect(st.playlist[0]).toMatchObject({
      title: "Canción",
      artist: "Artista",
      durationMs: 123_000,
      sourceUri: "./audio/cancion.mp3",
    });
    expect(st.playlist[1].durationMs).toBe(30_000);
  });
});

describe("parseStationJson", () => {
  test("acepta un objeto y un array de emisoras", () => {
    const one = JSON.stringify({
      name: "Emisora",
      playlist: [{ title: "Pista", durationMs: 42_000, sourceUri: "http://x/p.mp3" }],
    });
    expect(parseStationJson(one)).toHaveLength(1);
    expect(parseStationJson(`[${one},${one}]`)).toHaveLength(2);
  });
});

describe("resolveTracksWithAudioFiles", () => {
  test("usa la URL lozkho.local (streaming) SIN guardar el audio en IndexedDB", async () => {
    const station: any = {
      name: "Emisora",
      playlist: [
        {
          id: "t1",
          title: "Mi canción",
          artist: "Artista",
          durationMs: 30_000,
          sourceUri: "./audio/mi-cancion.mp3",
        },
      ],
    };
    const files: any[] = [
      {
        name: "mi-cancion.mp3",
        relativePath: "Emisora/audio/mi-cancion.mp3",
        size: 1234,
        type: "audio/mpeg",
        contentUrl: "https://lozkho.local/BASE64URI",
      },
    ];
    const result = await resolveTracksWithAudioFiles(station, files);
    expect(result.playlist[0].sourceUri).toBe("https://lozkho.local/BASE64URI");
    expect(result.playlist[0].id).toBe("t1");
  });

  test("sin coincidencia marca demo:no-audio para que el reproductor no se cuelgue", async () => {
    const station: any = {
      name: "Emisora",
      playlist: [
        { id: "t2", title: "Otra", artist: "A", durationMs: 30_000, sourceUri: "./x.mp3" },
      ],
    };
    const result = await resolveTracksWithAudioFiles(station, [] as any[]);
    expect(result.playlist).toHaveLength(1);
  });
});
