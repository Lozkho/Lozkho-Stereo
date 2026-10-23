import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  // CRÍTICO: assetPrefix "./" genera rutas relativas (./_next/...)
  // Necesario para que WebViewAssetLoader funcione correctamente.
  // Sin assetPrefix, las rutas son absolutas (/_next/...) y el
  // path handler "/" las recibe sin el "/" inicial, pero el navegador
  // interno del WebView las resuelve relativas al dominio base.
  // Con assetPrefix "./", las rutas son ./_next/... que el WebView
  // resuelve como https://appassets.androidplatform.net/_next/...
  // y el path handler las intercepta correctamente.
  assetPrefix: "./",
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;

