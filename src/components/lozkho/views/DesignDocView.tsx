"use client";

import {
  Radio,
  Smartphone,
  Music,
  FileText,
  Megaphone,
  Bell,
  Shield,
  Repeat,
  Volume2,
  WifiOff,
  Palette,
} from "lucide-react";

export function DesignDocView() {
  return (
    <div className="px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-32 min-h-[100dvh] space-y-6">
      <header>
        <p className="text-[10px] uppercase tracking-widest text-white/40">
          Lozkho Stereo · Fase 1
        </p>
        <h1 className="text-2xl font-bold text-white">Documento de diseño</h1>
        <p className="text-[12px] text-white/55 mt-1 leading-snug">
          Resumen de la experiencia, propuesta visual mobile-first, comparación
          de arquitecturas y relación con la aplicación nativa final.
        </p>
      </header>

      {/* 1. Recorrido del usuario */}
      <Section icon={<Smartphone size={16} />} title="1 · Recorrido principal del usuario">
        <p className="text-[13px] text-white/75 leading-relaxed mb-3">
          El usuario abre Lozkho Stereo y ve directamente la <strong>emisora
          activa</strong> con su frecuencia, nombre, mood, eslogan y la pista
          actual en reproducción (o pausada). No hay pantalla de bienvenida ni
          login: la música está lista. La interfaz está pensada para{" "}
          <strong>una sola mano</strong> y un vistazo rápido desde el bolsillo.
        </p>
        <ol className="space-y-2 text-[12px] text-white/70 list-decimal pl-5">
          <li>
            <strong>Entrar:</strong> todas las emisoras arrancan simultáneamente;
            solo la activa es audible. La reproducción es continua e
            ininterrumpida aunque cambies de emisora.
          </li>
          <li>
            <strong>Escuchar:</strong> ver la frecuencia grande, la miniatura
            tipo vinilo girando, la pista actual y la letra resaltada.
          </li>
          <li>
            <strong>Cambiar de emisora:</strong> pulsar otra emisora en el dock
            inferior o en la lista. Solo la nueva es audible; la anterior sigue
            avanzando virtualmente en segundo plano. No hay pausa, no hay corte.
          </li>
          <li>
            <strong>Ver letras:</strong> modo normal (texto plano) o karaoke
            (sincronizado línea por línea).
          </li>
          <li>
            <strong>Importar contenido:</strong> pistas, anuncios, letras y
            miniaturas desde el selector de archivos. Sin mover los archivos de
            su ubicación original.
          </li>
          <li>
            <strong>Exportar:</strong> compartir la configuración de una emisora
            en M3U8 + JSON.
          </li>
          <li>
            <strong>En segundo plano:</strong> la música sigue con la pantalla
            bloqueada. La notificación muestra emisora y canción actual; un
            control permite silenciar/cambiar de emisora.
          </li>
        </ol>
      </Section>

      {/* 2. Propuesta visual mobile-first */}
      <Section icon={<Palette size={16} />} title="2 · Propuesta visual mobile-first">
        <div className="grid grid-cols-2 gap-3 text-[12px]">
          <SpecCard label="Fondo" value="Negro puro (#000) — fondo receptor nocturno" />
          <SpecCard label="Superficies" value="Negro con leve tinte (oklch 0.14)" />
          <SpecCard label="Texto primario" value="Blanco cálido (oklch 0.98)" />
          <SpecCard label="Texto secundario" value="Blanco 55% / 40%" />
          <SpecCard label="Acento" value="Por emisora (ámbar, violeta, esmeralda…)" />
          <SpecCard label="Frecuencia" value="Mono extrabold tipo display digital" />
          <SpecCard label="Tipografía cuerpo" value="Geist Sans (variable)" />
          <SpecCard label="Tipografía datos" value="JetBrains Mono / Geist Mono" />
          <SpecCard label="Esquinas" value="Redondeadas grandes (radius 0.875rem)" />
          <SpecCard label="Toques mínimos" value="44×44 px" />
          <SpecCard label="Safe areas" value="env(safe-area-inset-*) respetado" />
          <SpecCard label="Animaciones" value={'Sutiles: pulso "EN VIVO", vinilo girando, fade de letras'} />
        </div>

        <h3 className="text-sm font-semibold text-white mt-4 mb-2">
          Pantallas principales
        </h3>
        <ul className="space-y-2 text-[12px] text-white/70">
          <li>
            <strong className="text-white/90">Emisora (Now Playing):</strong>{" "}
            frecuencia gigante, miniatura vinilo, título/género/álbum, barra de
            progreso, panel de letras, dock de emisoras. Sin botón de
            play/pausa — auto-reproducción continua. Botón de ajustes (engranaje)
            en la barra superior.
          </li>
          <li>
            <strong className="text-white/90">Emisoras:</strong> lista de
            emisoras con estado, duración del ciclo, número de pistas y anuncios,
            botones de importar/exportar, creación de emisora.
          </li>
          <li>
            <strong className="text-white/90">Letras:</strong> búsqueda local y
            en línea (3 simultáneas), importar directorio, formato LRC
            explicado, listado con badges <em>Local</em> / <em>En línea</em>.
          </li>
          <li>
            <strong className="text-white/90">Ajustes de emisora:</strong> panel
            lateral con identidad, paleta, estrategia de progreso y
            programación de anuncios.
          </li>
          <li>
            <strong className="text-white/90">Diseño y Decisiones:</strong>{" "}
            documentación in-app de la fase 1, revisable sin salir del
            prototipo.
          </li>
        </ul>

        <h3 className="text-sm font-semibold text-white mt-4 mb-2">
          Estados de reproducción
        </h3>
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <StateChip color="#10B981" label="EN EMISIÓN · música (activa)" />
          <StateChip color="#F59E0B" label="EN EMISIÓN · publicidad" />
          <StateChip color="#A855F7" label="EN VIVO · emisora audible" />
          <StateChip color="#3B82F6" label="2º PLANO · suena solo virtual" />
          <StateChip color="#6B7280" label="EN ESPERA · solo al cargar (breve)" />
        </div>
        <p className="text-[11px] text-white/45 mt-3 leading-snug">
          La <strong>auto-reproducción es continua e indefinida</strong> desde
          que abre la app: todas las emisoras muestran progreso siempre. La activa
          reproduce audio real; las demás muestran el badge "2º plano" e indican
          qué pista estaría sonando si estuvieran seleccionadas.
        </p>
      </Section>

      {/* 3. Diferenciación de anuncios */}
      <Section icon={<Megaphone size={16} />} title="3 · Diferenciación visual de anuncios">
        <ul className="space-y-2 text-[12px] text-white/70">
          <li>
            Badge superior cambia a{" "}
            <span className="text-amber-300 font-semibold">"PUBLICIDAD"</span>{" "}
            (ámbar) en vez de <span className="text-white">"EN EMISIÓN"</span>.
          </li>
          <li>
            Borde de la tarjeta con tinte ámbar y fondo muy sutil del mismo
            color.
          </li>
          <li>
            La miniatura vinilo se detiene y se sustituye por un icono de
            altavoz/megáfono.
          </li>
          <li>
            El panel de letras se oculta y se sustituye por un aviso discreto:
            "Las letras se ocultan durante la publicidad."
          </li>
          <li>
            Aparece un banner bajo la tarjeta:{" "}
            <em>"No se puede pausar ni saltar — el ciclo continúa."</em>
          </li>
        </ul>
      </Section>

      {/* 4. Comparación de arquitecturas */}
      <Section icon={<Repeat size={16} />} title="4 · Comparación de arquitecturas">
        <p className="text-[12px] text-white/70 leading-relaxed mb-3">
          Objetivos: Android 10+ y Windows 10, reproducción local offline,
          segundo plano, selector de archivos, letras, pantalla bloqueada,
          empaquetado portable. Se comparan cinco opciones razonables.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="text-left text-white/55 uppercase tracking-widest border-b border-white/10">
                <th className="py-2 pr-2">Criterio</th>
                <th className="py-2 px-2">React Native + RNW</th>
                <th className="py-2 px-2 text-emerald-300">Flutter ⭐</th>
                <th className="py-2 px-2">.NET MAUI</th>
                <th className="py-2 px-2">Capacitor / Ionic</th>
                <th className="py-2 px-2">Kotlin Multiplatform</th>
              </tr>
            </thead>
            <tbody className="text-white/80">
              <Row label="Lenguaje" cells={["JS/TS", "Dart", "C#", "JS/TS", "Kotlin"]} />
              <Row label="Soporte Windows" cells={["Vía react-native-windows (inmaduro)", "Oficial y estable", "Oficial (WinUI 3)", "PWA/Electron", "Vía Compose Desktop (en crecimiento)"]} />
              <Row label="Audio local en bucle" cells={["react-native-track-player (limitado en Win)", "just_audio + audio_service (excelente)", "NAudio / MediaPlayer (manual)", "HTML5 Audio (limitado)", "ExoPlayer + Compose Desktop"]} />
              <Row label="Notif. pantalla bloqueada" cells={["MediaSession plugin", "audio_service MediaSession (completo)", "MediaSession nativo Win + Android", "Media Session API web (limitado)", "MediaSession Android"]} />
              <Row label="Selector archivos / SAF" cells={["expo-document-picker", "file_picker + permission_handler", "Windows.Storage.Pickers / SAF", "File API web", "Android SAF + AWT en desktop"]} />
              <Row label="Empaquetado Windows" cells={["MSI complejo", "MSIX / ZIP portable", "MSIX / ZIP", "PWA / Electron", "MSI / jpackage"]} />
              <Row label="Empaquetado Android" cells={["AAB/APK estándar", "AAB/APK estándar", "AAB/APK estándar", "PWA", "AAB/APK estándar"]} />
              <Row label="Mantenimiento a largo plazo" cells={["Medio (2 runtimes)", "Alto (1 runtime, hot reload)", "Alto (Microsoft)", "Bajo para audio", "Medio-alto (KMP estable 1.0)"]} />
            </tbody>
          </table>
        </div>
        <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3">
          <p className="text-[12px] text-white/85 leading-relaxed">
            <strong className="text-emerald-300">Recomendación: Flutter.</strong>{" "}
            Es la opción que mejor cubre los requisitos con un único código
            fuente: reproducción de audio en segundo plano robusta vía{" "}
            <code>just_audio</code> + <code>audio_service</code>, notificaciones
            nativas y <em>media session</em> en Android, paquete Windows oficial
            (Windows 10+), soporte para SAF / FilePicker, y rendimiento nativo.
            El prototipo web (este) se reutiliza como referencia visual y de
            estados: el <strong>modelo de datos</strong> y los{" "}
            <strong>flujos de pantalla</strong> del prototipo son trasladables
            1:1 a widgets Flutter; solo cambia el runtime de audio (HTML5 Audio
            → ExoPlayer/MediaFoundation).
          </p>
        </div>
        <p className="text-[11px] text-white/50 mt-3 leading-snug">
          Alternativa válida: <strong>.NET MAUI</strong> si el equipo ya domina
          C# y se valora la integración Windows nativa por encima de la
          comunidad de Flutter. Coste: escribir manualmente la capa de
          <em>MediaSession</em>.
        </p>
      </Section>

      {/* 5. Relación prototipo → app final */}
      <Section icon={<Radio size={16} />} title="5 · Relación entre el prototipo web y la app final">
        <ul className="space-y-2 text-[12px] text-white/70">
          <li>
            <strong>Lo que SÍ es trasladable:</strong> modelo de datos (ver{" "}
            <code>types.ts</code>), estados de reproducción, reglas de bucle,
            intercalado de anuncios, estimación de ciclo, paleta por emisora,
            formato LRC, lógica de coincidencia de letras, docks de navegación.
          </li>
          <li>
            <strong>Lo que NO es trasladable directo:</strong> el reloj virtual
            aquí se simula con <code>setInterval</code>; en la app nativa es
            controlado por el evento <code>onPositionChanged</code> del
            reproductor. El selector de archivos usa aquí un <code>alert()</code>
            simulado; en la app nativa usa SAF/FilePicker.
          </li>
          <li>
            <strong>Lo que falta por implementar nativamente:</strong>{" "}
            notificación de pantalla bloqueada, controles de medios del sistema,
            permisos Android 10+ (READ_MEDIA_AUDIO en Android 13+),
            persistencia real (SQLite/Hive), sincronización en línea real
            contra LRCLIB, firma del APK de publicación.
          </li>
        </ul>
      </Section>

      {/* 6. Notas importantes */}
      <Section icon={<Shield size={16} />} title="6 · Notas de privacidad y licencias">
        <ul className="space-y-2 text-[12px] text-white/70">
          <li className="flex items-start gap-2">
            <WifiOff size={14} className="text-emerald-300 mt-0.5 shrink-0" />
            <span>
              <strong>Sin conexión por defecto.</strong> La música, metadatos,
              letras y carátulas se leen desde el dispositivo. La búsqueda de
              letras en línea es <em>opcional</em> y desactivada por defecto.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Volume2 size={14} className="text-amber-300 mt-0.5 shrink-0" />
            <span>
              <strong>Solo una emisora audible.</strong> Las demás no decodifican
              audio; solo conservan su posición virtual. No hay gasto de CPU
              extra por tener múltiples emisoras.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Bell size={14} className="text-sky-300 mt-0.5 shrink-0" />
            <span>
              <strong>Teclas de volumen bloqueadas:</strong> Android no permite
              interceptar de forma fiable las teclas físicas de volumen cuando
              la pantalla está bloqueada. La alternativa propuesta es un control
              en la notificación y un gesto configurable en la pantalla de
              bloqueo del sistema (MediaSession).
            </span>
          </li>
        </ul>
      </Section>
    </div>
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
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="flex items-center gap-2 text-base font-bold text-white mb-3">
        <span className="text-white/70">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function SpecCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <p className="text-[10px] uppercase tracking-widest text-white/45">
        {label}
      </p>
      <p className="text-[12px] text-white/85 mt-0.5">{value}</p>
    </div>
  );
}

function StateChip({ color, label }: { color: string; label: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2 flex items-center gap-2">
      <span
        className="w-2.5 h-2.5 rounded-full live-dot"
        style={{ backgroundColor: color }}
      />
      <span className="text-[11px] text-white/75">{label}</span>
    </div>
  );
}

function Row({ label, cells }: { label: string; cells: string[] }) {
  return (
    <tr className="border-b border-white/5">
      <td className="py-2 pr-2 font-semibold text-white/65">{label}</td>
      {cells.map((c, i) => (
        <td key={i} className="py-2 px-2 text-white/75">
          {c}
        </td>
      ))}
    </tr>
  );
}
