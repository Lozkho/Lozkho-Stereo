"use client";

import { useLozkho } from "@/lozkho/store";
import { Check, AlertTriangle, Info } from "lucide-react";

interface DecisionItem {
  id: string;
  title: string;
  status: "recommended" | "needs-approval" | "limitation";
  summary: string;
  details: string[];
}

const DECISIONS: DecisionItem[] = [
  {
    id: "D1",
    title: "Arquitectura: Flutter (Android + Windows)",
    status: "needs-approval",
    summary:
      "Recomendamos Flutter como arquitectura compartida para Android 10+ y Windows 10. Si prefieres .NET MAUI, indícalo.",
    details: [
      "Paquetes clave: just_audio, audio_service, file_picker, permission_handler, sqflite, path_provider.",
      "Compilación Windows: MSIX o ZIP portable vía `flutter build windows --release`.",
      "Compilación Android: AAB/APK con `flutter build apk` o `flutter build appbundle`.",
    ],
  },
  {
    id: "D2",
    title: "Auto-reproducción continua: todas avanzan, solo suena la activa",
    status: "recommended",
    summary:
      "Auto-reproducción indefinida desde que abre la app. Todas las emisoras se reproducen en simultáneo; solo la activa es audible. No hay botón de pausa global.",
    details: [
      "El reloj virtual de cada emisora siempre avanza (no hay forma de pausarlo desde la UI).",
      "Cambio de emisora = solo se cambia cuál es audible; nada se interrumpe.",
      "Eficiencia: las emisoras no activas solo actualizan su posición virtual (sin decodificar audio).",
      "En la app nativa, el sistema (MediaSession) podrá pausar temporalmente ante eventos externos (llamadas, desconexión de auriculares); la app reanudará automáticamente cuando sea posible.",
    ],
  },
  {
    id: "D3",
    title: "Controles del usuario: solo cambiar de emisora",
    status: "needs-approval",
    summary:
      "Sin botón de play/pausa, sin seek, sin saltar pista, sin retroceder. El único control de reproducción permitido es cambiar de emisora. Se respeta estrictamente el requisito «no pausar, detener, adelantar, retroceder ni buscar».",
    details: [
      "No hay botón de pausa global: la reproducción es continua e indefinida por diseño.",
      "El botón principal de la pantalla es siempre «cambiar de emisora».",
      "Durante la publicidad no se puede saltar ni evadir (igual que en una radio real).",
      "Dentro de una canción no hay seek, no hay saltar pista, no hay retroceder.",
      "El botón de ajustes (engranaje) permite editar la emisora activa sin detener la reproducción.",
    ],
  },
  {
    id: "D4",
    title: "Letras en línea: LRCLIB (MIT), opcional, máx. 3 simultáneas",
    status: "recommended",
    summary:
      "Búsqueda en línea desactivada por defecto. Al activarse, se ejecutan máximo 3 tareas simultáneas y se cachean localmente.",
    details: [
      "Fuente: https://lrclib.net — API pública, licencia MIT.",
      "Las letras obtenidas se marcan con badge \"En línea\" y se cachean para uso sin conexión.",
      "Se respeta cualquier condición de la fuente (attribution, rate-limit).",
    ],
  },
  {
    id: "D5",
    title: "Formato de importación/exportación: M3U8 + JSON sidecar",
    status: "needs-approval",
    summary:
      "M3U8 (UTF-8) lista de referencias + JSON con metadatos de emisora (frecuencia, colores, mood, eslogan, programación de anuncios).",
    details: [
      "M3U8/M3U no transporta metadatos avanzados; por eso se complementa con JSON.",
      "Rutas persistentes en Android: content:// (SAF). En Windows: rutas absolutas con permiso de carpeta.",
      "Limitación: M3U clásico no soporta UTF-8; se leerá pero se exportará siempre como M3U8.",
    ],
  },
  {
    id: "D6",
    title: "Formatos de audio soportados (no \"todos\")",
    status: "limitation",
    summary:
      "No es posible soportar literalmente todos los formatos. Se priorizan los formatos libres y los habituales.",
    details: [
      "Soportados en Flutter (just_audio / ExoPlayer + MediaFoundation): MP3, AAC/M4A, FLAC, WAV, OGG/Vorbis, Opus.",
      "Soporte limitado o sin garantía: WMA, ALAC (depende del códec instalado en Windows), APE.",
      "Estrategia práctica: intento de reproducción nativa; si falla, transcodificación on-the-fly vía FFmpeg (licencia LGPL, complemento).",
      "DRM protegido (Apple Music, Spotify, etc.): NO se soporta.",
    ],
  },
  {
    id: "D7",
    title: "Pantalla bloqueada: no se interceptan teclas de volumen",
    status: "limitation",
    summary:
      "Android no permite interceptar de forma fiable las teclas físicas de volumen con pantalla bloqueada. Se propone alternativa configurable.",
    details: [
      "Alternativa: notificación de medios con MediaSession (cambio de emisora vía acción personalizada).",
      "Adicionalmente: gesto configurable en pantalla de bloqueo del sistema (no es interceptar teclas).",
      "En Windows: atajos de teclado globales (p. ej. Ctrl+Alt+Flecha) registrados por la app.",
    ],
  },
  {
    id: "D8",
    title: "Persistencia: SQLite (sqflite) + referencias persistentes",
    status: "recommended",
    summary:
      "Las emisoras, playlists, anuncios y preferencias se guardan en SQLite. Las rutas a archivos se conservan con permisos persistentes.",
    details: [
      "Android 10+ SAF: takePersistableUriPermission para cada content:// importado.",
      "Windows: rutas absolutas bajo carpeta con permiso o dentro del directorio de la app.",
      "No se copian los archivos: se referencian en su ubicación original.",
    ],
  },
  {
    id: "D9",
    title: "APK de depuración por defecto, publicación con secretos",
    status: "needs-approval",
    summary:
      "GitHub Actions producirá un APK de depuración por defecto (sin secretos). Para publicación, documentamos cómo configurar la firma con secretos.",
    details: [
      "Workflow Android: `flutter build apk --debug` (sin keystore).",
      "Para release: subir keystore base64 como secreto `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.",
      "El workflow nunca incluye secretos en el código fuente; se inyectan en CI.",
    ],
  },
  {
    id: "D10",
    title: "Emisoras de ejemplo: audio CC0 / CC-BY / Pixabay",
    status: "needs-approval",
    summary:
      "Para los prototipos y la app, los archivos de música y anuncios se obtendrán de fuentes con licencia libre.",
    details: [
      "Fuentes previstas: Pixabay Music (CC0 / Pixabay License), Free Music Archive (CC-BY), Incompetech (CC-BY) o composiciones originales.",
      "La atribución requerida se mostrará en una pantalla \"Créditos\".",
      "Si no se pueden incluir archivos directamente por tamaño/licencia, se ofrece un script que descarga los ejemplos desde las fuentes originales al primer inicio (con consentimiento).",
    ],
  },
  {
    id: "D11",
    title: "Idioma de la app: español (es-419 y es-ES)",
    status: "recommended",
    summary:
      "La interfaz, documentación y mensajes se entregan en español. Estructura preparada para internacionalización.",
    details: [
      "Strings centralizados via `flutter_localizations` + ARB.",
      "Nombres técnicos (M3U8, FLAC, SAF, MediaSession) se mantienen sin traducir.",
    ],
  },
];

export function DecisionsView() {
  const resetDemo = useLozkho((s) => s.resetDemo);

  return (
    <div className="px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-32 min-h-[100dvh]">
      <header className="mb-4">
        <p className="text-[10px] uppercase tracking-widest text-white/40">
          Lozkho Stereo · Fase 1
        </p>
        <h1 className="text-2xl font-bold text-white">Decisiones para aprobar</h1>
        <p className="text-[12px] text-white/55 mt-1 leading-snug">
          Lista de decisiones técnicas o limitaciones importantes que requieren
          tu aprobación antes de pasar a la fase de implementación. Marca las
          que apruebas o ajusta las que necesites cambiar.
        </p>
      </header>

      <div className="space-y-3">
        {DECISIONS.map((d) => (
          <DecisionCard key={d.id} decision={d} />
        ))}
      </div>

      <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-white mb-2">
          <Info size={16} className="text-sky-300" /> Próximos pasos
        </h2>
        <ol className="space-y-2 text-[12px] text-white/70 list-decimal pl-5">
          <li>
            Revisa el prototipo en la pestaña <strong>Emisora</strong>. Ajusta
            colores, frecuencia, eslogan y mood desde el ícono de ajustes
            (engranaje) para validar la propuesta visual.
          </li>
          <li>
            Comprueba la vista <strong>Emisoras</strong>: observa cómo cada
            emisora conserva su posición virtual cuando cambias.
          </li>
          <li>
            Revisa la vista <strong>Letras</strong>: cambia entre modo normal y
            karaoke; verifica el auto-scroll sincronizado.
          </li>
          <li>
            Marca tu aprobación o ajustes sobre estas decisiones. Cuando
            apruebes, iniciamos la fase de implementación (repositorio GitHub +
            GitHub Actions para APK y ZIP de Windows).
          </li>
        </ol>
        <button
          onClick={() => {
            if (confirm("¿Reiniciar el prototipo a los datos demo originales?")) {
              resetDemo();
            }
          }}
          className="mt-4 text-[11px] text-white/55 hover:text-white/80 underline underline-offset-2"
        >
          Reiniciar prototipo a datos demo
        </button>
      </section>
    </div>
  );
}

function DecisionCard({ decision }: { decision: DecisionItem }) {
  const colors: Record<DecisionItem["status"], string> = {
    recommended: "border-emerald-500/30 bg-emerald-500/[0.05]",
    "needs-approval": "border-amber-500/30 bg-amber-500/[0.05]",
    limitation: "border-rose-500/30 bg-rose-500/[0.05]",
  };
  const Icon =
    decision.status === "recommended"
      ? Check
      : decision.status === "limitation"
        ? AlertTriangle
        : Info;
  const iconColor =
    decision.status === "recommended"
      ? "text-emerald-300"
      : decision.status === "limitation"
        ? "text-rose-300"
        : "text-amber-300";
  const statusLabel =
    decision.status === "recommended"
      ? "Recomendado"
      : decision.status === "limitation"
        ? "Limitación técnica"
        : "Requiere aprobación";

  return (
    <article className={`rounded-3xl border p-4 ${colors[decision.status]}`}>
      <header className="flex items-start gap-3 mb-2">
        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
          <Icon size={16} className={iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-mono uppercase tracking-widest text-white/45">
              {decision.id}
            </span>
            <span className={`text-[10px] font-medium ${iconColor}`}>
              {statusLabel}
            </span>
          </div>
          <h3 className="text-sm font-bold text-white">{decision.title}</h3>
        </div>
      </header>
      <p className="text-[12px] text-white/80 leading-relaxed mb-2">
        {decision.summary}
      </p>
      <ul className="space-y-1 text-[11px] text-white/65 list-disc pl-5">
        {decision.details.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>
    </article>
  );
}
