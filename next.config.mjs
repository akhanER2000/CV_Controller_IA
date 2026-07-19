/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
    "/opengraph-image": ["./src/lib/fonts/*.ttf"],
    "/twitter-image": ["./src/lib/fonts/*.ttf"],
    "/icon": ["./src/lib/fonts/*.ttf"],
    "/apple-icon": ["./src/lib/fonts/*.ttf"],
  },
};

export default nextConfig;
