import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Config propia de la AUDITORÍA de plantillas (no entra en `npm test`: tarda
// minutos y escribe ficheros). Se lanza con:
//   npx vitest run --config scripts/plantillas/vitest.config.ts
export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("../../tests/stubs/server-only.ts", import.meta.url)),
      "@": fileURLToPath(new URL("../../src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    root: fileURLToPath(new URL("../..", import.meta.url)),
    include: ["scripts/plantillas/**/*.audit.ts"],
    testTimeout: 3_600_000,
    hookTimeout: 3_600_000,
  },
  oxc: {
    jsx: { runtime: "automatic", importSource: "react" },
  },
} as never);
