// El «webServer» de playwright.config.ts: NO levanta nada (DA-M6). Playwright solo lo
// ejecuta si el servidor no responde; entonces explica qué falta y sale con 1.
const base = process.env.E2E_BASE_URL || "http://localhost:3000";
console.error(
  `\n[e2e] ${base} no responde. Las e2e solo corren contra el dev:local de AKHAN ` +
    "(npm run dev:local en el puerto 3000, Supabase local). Esta config no levanta " +
    "servidor propio: arráncalo en su ventana y repite.\n",
);
process.exit(1);
