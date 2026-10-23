import type { Station, StationLyrics, Track, Ad } from "./types";

/**
 * Datos de demostración del prototipo Lozkho Stereo.
 *
 * NOTA SOBRE LICENCIAS:
 * - Los "tracks" listados aquí son ficticios y de demostración (autores y títulos
 *   originales para el prototipo). En la implementación nativa se sustituirán por
 *   audio libre (CC0 / CC-BY / Pixabay Music / Free Music Archive) o por archivos
 *   que el usuario importe desde su dispositivo.
 * - Las "letras" incluidas son originales del prototipo Lozkho Stereo y se
 *   liberan como CC0 1.0 — libre para cualquier uso sin atribución.
 * - Los "anuncios" son ficticios y de demostración.
 *
 * En la app nativa, la importación usará `FilePicker` / `SAF` (Android) y el
 * selector de archivos nativo (Windows), conservando referencias persistentes
 * vía `MediaStore` / `content://` persistible (Android 10+) o rutas directas
 * con permiso de carpeta (Windows).
 */

const lyricsSintesisNocturna: StationLyrics = {
  id: "lyr-sintesis",
  matchKey: "Síntesis Nocturna",
  title: "Síntesis Nocturna",
  artist: "Lozkho Demo",
  source: "local",
  offsetMs: 0,
  license: "CC0 1.0 (letra original del prototipo Lozkho Stereo)",
  lines: [
    { timeMs: 0, text: "[ instrumental ]" },
    { timeMs: 8000, text: "La ciudad enciende sus luces de neón" },
    { timeMs: 13000, text: "y el sintetizador dibuja el color." },
    { timeMs: 18000, text: "Cada nota es una ventana abierta" },
    { timeMs: 23000, text: "al rumor de la noche sin dolor." },
    { timeMs: 29000, text: "Baila despacio, no te detengas," },
    { timeMs: 34000, text: "que el ritmo nos lleva muy lejos." },
    { timeMs: 39000, text: "Síntesis nocturna, sirena suave," },
    { timeMs: 44000, text: "tejiendo el aire entre los faroles." },
    { timeMs: 50000, text: "[ instrumental ]" },
    { timeMs: 58000, text: "La ciudad enciende sus luces de neón" },
    { timeMs: 63000, text: "y el sintetizador dibuja el color." },
  ],
};

const lyricsBrumaAzul: StationLyrics = {
  id: "lyr-bruma",
  matchKey: "Bruma Azul",
  title: "Bruma Azul",
  artist: "Lozkho Demo",
  source: "online",
  offsetMs: 0,
  license:
    "Obtenida en línea (demostrativa). En la app real se usará LRCLIB (MIT) con atribución y caché local.",
  lines: [
    { timeMs: 0, text: "[ piano suave ]" },
    { timeMs: 7000, text: "Bruma azul sobre el río," },
    { timeMs: 12000, text: "el saxo cuenta una historia que no es mía." },
    { timeMs: 18000, text: "La lluvia escribe despacio" },
    { timeMs: 23000, text: "sobre el cristal de la madrugada." },
    { timeMs: 30000, text: "Y tú, que no estás," },
    { timeMs: 34000, text: "sigues siendo la nota más larga." },
    { timeMs: 40000, text: "Bruma azul, bruma azul," },
    { timeMs: 44000, text: "lo que el silencio no se llevó." },
    { timeMs: 51000, text: "[ solo de saxo ]" },
    { timeMs: 59000, text: "Bruma azul, despídete por mí." },
  ],
};

const lyricsCumbiaDelSur: StationLyrics = {
  id: "lyr-cumbia",
  matchKey: "Cumbia del Sur",
  title: "Cumbia del Sur",
  artist: "Lozkho Demo",
  source: "local",
  offsetMs: 0,
  license: "CC0 1.0 (letra original del prototipo Lozkho Stereo)",
  lines: [
    { timeMs: 0, text: "[ guacharaca ]" },
    { timeMs: 6000, text: "Baja del cerro la cumbia del sur" },
    { timeMs: 11000, text: "con tambor de fiesta y clarín de luz." },
    { timeMs: 17000, text: "El bajo camina, el piano conversa," },
    { timeMs: 22000, text: "y el coro repite: «que no acabe nunca»." },
    { timeMs: 29000, text: "Baila el verano, baila el invierno," },
    { timeMs: 34000, text: "baila la pampa, baila la sal." },
    { timeMs: 40000, text: "Cumbia del sur, cumbia del norte," },
    { timeMs: 45000, text: "el mismo latido bajo el mismo sol." },
    { timeMs: 51000, text: "[ solo de acordeón ]" },
    { timeMs: 59000, text: "Que no acabe nunca, que no acabe más." },
  ],
};

const lyricsNeonTarde: StationLyrics = {
  id: "lyr-neon",
  matchKey: "Neón Tarde",
  title: "Neón Tarde",
  artist: "Lozkho Demo",
  source: "local",
  offsetMs: 0,
  license: "CC0 1.0 (letra original del prototipo Lozkho Stereo)",
  lines: [
    { timeMs: 0, text: "[ arpegio ]" },
    { timeMs: 5000, text: "El neón prende tarde hoy" },
    { timeMs: 10000, text: "y el bajo camina despacio." },
    { timeMs: 15000, text: "Una sirena lejana" },
    { timeMs: 20000, text: "nos saluda desde el puerto." },
    { timeMs: 26000, text: "Cae la luz, sube el ritmo," },
    { timeMs: 31000, text: "se enciende la calle entera." },
    { timeMs: 37000, text: "Neón tarde, neón claro," },
    { timeMs: 42000, text: "color de una noche entera." },
    { timeMs: 48000, text: "[ instrumental ]" },
    { timeMs: 56000, text: "Neón tarde, neón claro." },
  ],
};

const lyricsMadrugadaLenta: StationLyrics = {
  id: "lyr-madrugada",
  matchKey: "Madrugada Lenta",
  title: "Madrugada Lenta",
  artist: "Lozkho Demo",
  source: "online",
  offsetMs: 0,
  license:
    "Obtenida en línea (demostrativa). En la app real se usará LRCLIB (MIT) con atribución y caché local.",
  lines: [
    { timeMs: 0, text: "[ contrabajo ]" },
    { timeMs: 6000, text: "Madrugada lenta" },
    { timeMs: 11000, text: "de café frío y piano gris." },
    { timeMs: 17000, text: "Una mano escribe" },
    { timeMs: 22000, text: "lo que el silencio ya dijo." },
    { timeMs: 29000, text: "Noche que se va" },
    { timeMs: 34000, text: "sin prisa, sin pedir permiso." },
    { timeMs: 40000, text: "Madrugada lenta," },
    { timeMs: 45000, text: "última copa del vacío." },
    { timeMs: 51000, text: "[ solo de piano ]" },
    { timeMs: 59000, text: "Madrugada lenta, adiós." },
  ],
};

const lyricsFogataVerde: StationLyrics = {
  id: "lyr-fogata",
  matchKey: "Fogata Verde",
  title: "Fogata Verde",
  artist: "Lozkho Demo",
  source: "local",
  offsetMs: 0,
  license: "CC0 1.0 (letra original del prototipo Lozkho Stereo)",
  lines: [
    { timeMs: 0, text: "[ quena ]" },
    { timeMs: 6000, text: "Fogata verde en el cerro," },
    { timeMs: 11000, text: "baila el viento con el cuero." },
    { timeMs: 17000, text: "Cuenta el bombo, cuenta el tiempo," },
    { timeMs: 22000, text: "cuenta el canto del centro." },
    { timeMs: 28000, text: "Sube la flauta, baja el sol," },
    { timeMs: 33000, text: "rueda la tierra, rueda la voz." },
    { timeMs: 39000, text: "Fogata verde, fogata fiel," },
    { timeMs: 44000, text: "enciende el valle como papel." },
    { timeMs: 51000, text: "[ solo de charango ]" },
    { timeMs: 59000, text: "Fogata verde, rueda la voz." },
  ],
};

export const DEMO_LYRICS: StationLyrics[] = [
  lyricsSintesisNocturna,
  lyricsNeonTarde,
  lyricsBrumaAzul,
  lyricsMadrugadaLenta,
  lyricsCumbiaDelSur,
  lyricsFogataVerde,
];

/** Construye la playlist de la emisora con referencias a lyricsId. */
function makePlaylist(items: Omit<Track, "id">[]): Track[] {
  return items.map((t, i) => ({ ...t, id: `trk-${i}-${t.title}` }));
}

function makeAds(items: Omit<Ad, "id">[]): Ad[] {
  return items.map((a, i) => ({ ...a, id: `ad-${i}-${a.title}` }));
}

// --- Emisora 1: Lozkho FM ---------------------------------------------------
const station1Tracks = makePlaylist([
  {
    title: "Síntesis Nocturna",
    artist: "Lozkho Demo",
    album: "Prototipo Vol. 1",
    genre: "Synthwave",
    durationMs: 70000, // 1:10 demo (en app real sería duración real del archivo)
    lyricsId: "lyr-sintesis",
    sourceUri: "content://lozkho.demo/sintesis.mp3",
    license: "Demo Lozkho (CC0) — prototipo",
  },
  {
    title: "Neón Tarde",
    artist: "Lozkho Demo",
    album: "Prototipo Vol. 1",
    genre: "Synthwave",
    durationMs: 64000,
    lyricsId: "lyr-neon",
    sourceUri: "content://lozkho.demo/neon.mp3",
    license: "Demo Lozkho (CC0) — prototipo",
  },
  {
    title: "Reflejo Modular",
    artist: "Lozkho Demo",
    album: "Prototipo Vol. 1",
    genre: "Electrónica",
    durationMs: 58000,
    sourceUri: "content://lozkho.demo/reflejo.mp3",
    license: "Demo Lozkho (CC0) — prototipo",
  },
]);

const station1Ads = makeAds([
  {
    title: "Café Aurora — tu mañana empieza aquí",
    sponsor: "Café Aurora (demo)",
    durationMs: 15000,
    sourceUri: "content://lozkho.demo/ad-cafe.mp3",
    license: "Demo Lozkho (CC0) — prototipo",
  },
  {
    title: "Banco del Valle — crédito libre, sin papeleo",
    sponsor: "Banco del Valle (demo)",
    durationMs: 18000,
    sourceUri: "content://lozkho.demo/ad-banco.mp3",
    license: "Demo Lozkho (CC0) — prototipo",
  },
]);

// --- Emisora 2: Noche AM ---------------------------------------------------
const station2Tracks = makePlaylist([
  {
    title: "Bruma Azul",
    artist: "Lozkho Demo",
    album: "Prototipo Vol. 2",
    genre: "Jazz",
    durationMs: 74000,
    lyricsId: "lyr-bruma",
    sourceUri: "content://lozkho.demo/bruma.mp3",
    license: "Demo Lozkho (CC0) — prototipo",
  },
  {
    title: "Madrugada Lenta",
    artist: "Lozkho Demo",
    album: "Prototipo Vol. 2",
    genre: "Blues",
    durationMs: 68000,
    lyricsId: "lyr-madrugada",
    sourceUri: "content://lozkho.demo/madrugada.mp3",
    license: "Demo Lozkho (CC0) — prototipo",
  },
  {
    title: "Café sin Prisa",
    artist: "Lozkho Demo",
    album: "Prototipo Vol. 2",
    genre: "Smooth Jazz",
    durationMs: 60000,
    sourceUri: "content://lozkho.demo/cafe.mp3",
    license: "Demo Lozkho (CC0) — prototipo",
  },
]);

const station2Ads = makeAds([
  {
    title: "Librería Trébol — los libros que esperaban",
    sponsor: "Librería Trébol (demo)",
    durationMs: 16000,
    sourceUri: "content://lozkho.demo/ad-libreria.mp3",
    license: "Demo Lozkho (CC0) — prototipo",
  },
]);

// --- Emisora 3: Raízer Stereo ---------------------------------------------
const station3Tracks = makePlaylist([
  {
    title: "Cumbia del Sur",
    artist: "Lozkho Demo",
    album: "Prototipo Vol. 3",
    genre: "Cumbia",
    durationMs: 69000,
    lyricsId: "lyr-cumbia",
    sourceUri: "content://lozkho.demo/cumbia.mp3",
    license: "Demo Lozkho (CC0) — prototipo",
  },
  {
    title: "Fogata Verde",
    artist: "Lozkho Demo",
    album: "Prototipo Vol. 3",
    genre: "Folclore",
    durationMs: 66000,
    lyricsId: "lyr-fogata",
    sourceUri: "content://lozkho.demo/fogata.mp3",
    license: "Demo Lozkho (CC0) — prototipo",
  },
  {
    title: "Camino de Sal",
    artist: "Lozkho Demo",
    album: "Prototipo Vol. 3",
    genre: "Cumbia",
    durationMs: 62000,
    sourceUri: "content://lozkho.demo/camino.mp3",
    license: "Demo Lozkho (CC0) — prototipo",
  },
]);

const station3Ads = makeAds([
  {
    title: "Mercado del Puerto — sabores de la costa",
    sponsor: "Mercado del Puerto (demo)",
    durationMs: 17000,
    sourceUri: "content://lozkho.demo/ad-mercado.mp3",
    license: "Demo Lozkho (CC0) — prototipo",
  },
]);

function initialPlayback() {
  // Auto-reproducción indefinida: todas las emisoras arrancan con running=true.
  // No hay forma de pausarlas desde la UI; el reloj virtual avanza siempre.
  return {
    currentItemIndex: 0,
    positionMs: 0,
    lastTickAt: Date.now(),
    running: true,
    isAd: false,
  };
}

export const DEMO_STATIONS: Station[] = [
  {
    id: "st-1",
    name: "Lozkho FM",
    titleFont: "bebas",
    titleColor: null, // usa el accent por defecto
    thumbnailUri: null, // sin imagen importada → usa gradiente
    band: "FM",
    frequency: "101.5",
    mood: "Enérgico",
    slogan: "El ritmo que te mueve, sinSalir de casa.",
    colors: { accent: "#F59E0B", accent2: "#7C2D12" },
    thumbnail: "gradient:amber",

    playlist: station1Tracks,
    ads: station1Ads,
    adEvery: 2,
    playOrder: "import",
    playback: initialPlayback(),
  },
  {
    id: "st-2",
    name: "Noche AM",
    titleFont: "playfair",
    titleColor: null,
    thumbnailUri: null,
    band: "AM",
    frequency: "680",
    mood: "Melancólico",
    slogan: "Canciones para despedir el día.",
    colors: { accent: "#A855F7", accent2: "#1E1B4B" },
    thumbnail: "gradient:violet",

    playlist: station2Tracks,
    ads: station2Ads,
    adEvery: 3,
    playOrder: "import",
    playback: initialPlayback(),
  },
  {
    id: "st-3",
    name: "Raízer Stereo",
    titleFont: "oswald",
    titleColor: null,
    thumbnailUri: null,
    band: "FM",
    frequency: "89.3",
    mood: "Festivo",
    slogan: "Donde la tradición suena fuerte.",
    colors: { accent: "#10B981", accent2: "#064E3B" },
    thumbnail: "gradient:emerald",

    playlist: station3Tracks,
    ads: station3Ads,
    adEvery: 2,
    playOrder: "import",
    playback: initialPlayback(),
  },
];
