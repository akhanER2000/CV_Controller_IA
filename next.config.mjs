/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // react-pdf usa APIs de Node (fontkit, etc.): no lo empaquetes, cárgalo externo
  // en el runtime del servidor (la ruta /api/cv lo usa para renderizar el PDF).
  serverExternalPackages: ["@react-pdf/renderer"],
  // Las .ttf que registra ResumePDF (src/lib/fonts) se resuelven por ruta de
  // archivo; en el bundle serverless hay que incluirlas explícitamente o el
  // render falla en producción con "font not found".
  outputFileTracingIncludes: {
    "/api/cv": ["./src/lib/fonts/*.ttf"],
  },
};

export default nextConfig;
