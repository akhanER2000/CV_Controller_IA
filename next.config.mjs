/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Carpeta de salida configurable (NEXT_DIST_DIR) para que un build o un servidor
  // secundario no pisen el .next del dev:local de AKHAN (DA-C8). Por defecto, .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // react-pdf usa APIs de Node (fontkit, etc.): no lo empaquetes, cárgalo externo
  // en el runtime del servidor (la ruta /api/cv lo usa para renderizar el PDF).
  serverExternalPackages: ["@react-pdf/renderer"],
  // Las .ttf de src/lib/fonts se leen por RUTA DE ARCHIVO en tiempo de ejecución
  // (ResumePDF las registra en @react-pdf; las rutas de imagen las pasan a
  // ImageResponse). El tracer de Next no puede seguir una ruta dinámica, así que
  // toda ruta que lea una fuente debe declararla aquí o en producción se queda sin
  // ella: el PDF reventaba con "font not found" y la tarjeta de compartir caía a la
  // tipografía por defecto. Ya pasó una vez; por eso está comentado.
  outputFileTracingIncludes: {
    "/api/cv": ["./src/lib/fonts/*.ttf"],
    // Ajustar también renderiza (autofit → ResumePDF) para medir; sin esto se
    // quedaba sin fuentes al desplegar. Comodín en el segmento dinámico: "[id]"
    // sería una clase de caracteres para el glob.
    "/api/variants/*/ajustar": ["./src/lib/fonts/*.ttf"],
    "/opengraph-image": ["./src/lib/fonts/*.ttf"],
    "/twitter-image": ["./src/lib/fonts/*.ttf"],
    "/icon": ["./src/lib/fonts/*.ttf"],
    "/apple-icon": ["./src/lib/fonts/*.ttf"],
  },
};

export default nextConfig;
