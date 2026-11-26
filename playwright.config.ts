import { defineConfig, devices } from "@playwright/test";

/**
 * E2E de Corpus — prueba la CADENA REAL contra el dev:local de AKHAN.
 *
 * ★ NO levanta servidor propio (DA-M6, DA-C8): un `next dev` aparte compartía el
 *   `.next` del 3000 y apuntaba al Supabase REMOTO; dos veces dejó usuarios de prueba
 *   allí. Usa el servidor que YA corre en el 3000 (`npm run dev:local`, Supabase
 *   local). Si no responde, el «comando» de webServer solo explica qué falta y falla.
 * ★ El global-setup ABORTA si NEXT_PUBLIC_SUPABASE_URL no es 127.0.0.1/localhost,
 *   antes de crear ningún usuario.
 *
 * Correr con:  npm run test:e2e:local -- tests/e2e/flujo-cv.spec.ts
 *   (lee las claves de `supabase status -o env` y las pasa por el entorno, sin archivos).
 */
const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // La cadena es larga (la extracción real puede tardar decenas de segundos).
  timeout: 180_000,
  expect: { timeout: 20_000 },
  globalSetup: "./tests/e2e/global-setup.ts",
  reporter: [["list"]],
  use: {
    baseURL: BASE,
    trace: "on-first-retry",
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Nunca arranca nada: si el 3000 responde se reutiliza; si no, esto sale con 1
    // y un mensaje claro (no hay `next dev` de reserva).
    command: "node tests/e2e/sin-servidor.mjs",
    url: BASE,
    reuseExistingServer: true,
    timeout: 15_000,
    env: { E2E_BASE_URL: BASE },
  },
});
