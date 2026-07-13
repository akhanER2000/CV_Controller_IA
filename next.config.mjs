/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // react-pdf usa APIs de Node (fontkit, etc.): no lo empaquetes, cárgalo externo
  // en el runtime del servidor (la ruta /api/cv lo usa para renderizar el PDF).
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
