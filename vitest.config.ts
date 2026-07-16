import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Vitest 4 transforma con oxc, que por defecto hereda jsx:"preserve" del tsconfig
// (necesario para Next). Forzamos aquí el runtime automático de JSX para los tests.
export default defineConfig({
  resolve: {
    alias: {
      // `server-only` (marcador de Next) no resuelve en el entorno node de vitest:
      // se aliasa a un stub vacío para poder testear módulos del servidor.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
      // El alias `@/` de la app → src, para importar módulos que lo usan.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
  },
  oxc: {
    jsx: { runtime: "automatic", importSource: "react" },
  },
} as never);
