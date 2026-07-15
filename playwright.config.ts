import { defineConfig, devices } from "@playwright/test";

/**
 * E2E de Corpus — prueba la CADENA REAL, a propósito lenta y costosa:
 * cuenta nueva → estados vacíos → volcado (Gemini REAL) → staging con evidencia →
 * aceptar → master poblado → PDF por /api/cv (round-trip ATS con unpdf).
 *
 * Usa Supabase + Gemini REALES. Requiere en .env.local (o el entorno):
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *   SUPABASE_SERVICE_ROLE_KEY (para crear el usuario de prueba en global-setup),
 *   GEMINI_API_KEY (para la extracción).
 *
 * Servidor dedicado en el puerto 3100 (PORT/-p) para no chocar con el dev normal.
 * Correr con:  npm run test:e2e
 */
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
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { PORT: "3100" },
  },
});
