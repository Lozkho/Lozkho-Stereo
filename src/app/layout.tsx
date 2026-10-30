import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

/**
 * NOTA: Cargamos las fuentes con <link> a Google Fonts CDN en vez de
 * next/font/google para evitar un bug de Turbopack en CI
 * (next/font/google queries have exactly one entry) y la incompatibilidad
 * de webpack con `assetPrefix: "./"`.
 *
 * Las fuentes se cachean por el Service Worker tras la primera carga,
 * por lo que la app sigue funcionando sin conexión después del primer uso.
 * La caché del navegador también las mantiene disponibles entre sesiones.
 */

export const metadata: Metadata = {
  title: "Lozkho Stereo",
  description:
    "Aplicación de reproducción musical que simula una estación de radio. Funciona principalmente sin conexión a internet.",
  keywords: [
    "Lozkho Stereo",
    "radio",
    "música offline",
    "PWA",
    "Android",
    "Windows",
  ],
  authors: [{ name: "Lozkho Stereo" }],
  manifest: "./manifest.webmanifest",
  applicationName: "Lozkho Stereo",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Lozkho Stereo",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "./icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "./icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "./icon-192.png", sizes: "192x192" }],
  },
  openGraph: {
    title: "Lozkho Stereo",
    description:
      "Aplicación de música offline que simula una estación de radio.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  // IMPORTANTE: en Android WebView (Moto G7 Power y otros), si
  // maximumScale=1 el contenido se puede cortar en el borde derecho y
  // abajo. Lo quitamos para que el sistema renderice al ancho real.
  // viewportFit=cover para usar toda el área (notch, status bar).
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <head>
        {/* Preconnect para acelerar la carga inicial de fuentes */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Las 9 fuentes usadas por el selector de tipografía del título.
            Pesos alineados con FONT_CATALOG en src/lozkho/fonts.ts */}
        <link
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700&family=Geist+Mono:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700;800&family=Playfair+Display:wght@500;700;900&family=Bebas+Neue&family=Oswald:wght@400;500;700&family=Caveat:wght@500;700&family=Anton&family=Lora:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased bg-black text-foreground">
        {children}
        <Toaster />
        <SonnerToaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
