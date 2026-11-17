import { describe, expect, test } from "bun:test";
import { parseLRC, buildLRC, normalizeTitle } from "../../src/lozkho/lrc";

describe("LRC", () => {
  test("parsea cabeceras, offset y líneas con timestamp", () => {
    const lrc = [
      "[ti:Mi canción]",
      "[ar:Artista]",
      "[offset:+120]",
      "[00:08.00] Primera línea",
      "[00:12.50] Segunda línea",
    ].join("\n");
    const parsed = parseLRC(lrc, "Por defecto")!;
    expect(parsed).not.toBeNull();
    expect(parsed.title).toBe("Mi canción");
    expect(parsed.artist).toBe("Artista");
    expect(parsed.offsetMs).toBe(120);
    expect(parsed.lines[0]).toMatchObject({ timeMs: 8000 + 120, text: "Primera línea" });
    expect(parsed.lines[1]).toMatchObject({ timeMs: 12_500 + 120, text: "Segunda línea" });
  });

  test("buildLRC → parseLRC conserva título y líneas", () => {
    const original = parseLRC(
      "[ti:Título]\n[ar:Artista]\n[00:01.00] Uno\n[00:02.00] Dos",
      "Título"
    )!;
    const roundtrip = parseLRC(buildLRC(original), "Título")!;
    expect(roundtrip.title).toBe(original.title);
    expect(roundtrip.lines.map((l) => l.text)).toEqual(original.lines.map((l) => l.text));
  });

  test("normalizeTitle ignora acentos, espacios y puntuación", () => {
    expect(normalizeTitle("¡Sí, Mi Canción!")).toBe("simicancion");
  });
});
