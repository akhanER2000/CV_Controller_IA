import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * C1 · toda ruta que REDACTA (tarea `redaccion-preserva-hechos`) tiene que pasarle a
 * `modeloPara` la 3ª clave (Anthropic). Si una ruta nueva se olvida, redactaría con
 * Gemini aunque el usuario haya pegado su clave de Claude — y nadie lo vería: el
 * fallback funciona, solo que no es lo que el usuario configuró.
 */
function rutas(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? rutas(p) : n === "route.ts" ? [p] : [];
  });
}

const API = join(__dirname, "..", "src", "app", "api");
const redactoras = rutas(API).filter((p) => readFileSync(p, "utf8").includes('modeloPara("redaccion-preserva-hechos"'));

describe("redacción · la 3ª clave llega a todas las rutas que redactan", () => {
  it("hay rutas que redactan (si no, el candado no mira nada)", () => {
    expect(redactoras.some((p) => p.includes(join("variants", "[id]", "ajustar")))).toBe(true);
  });

  it.each(redactoras.map((p) => [p.slice(API.length + 1), p]))("%s pasa apiKey3 y lee getUserLlmKey3", (_n, p) => {
    const src = readFileSync(p, "utf8");
    const llamadas = src.match(/modeloPara\("redaccion-preserva-hechos"[^)]*\)/g) ?? [];
    expect(llamadas.length).toBeGreaterThan(0);
    for (const c of llamadas) expect(c.split(",").length, c).toBe(5);
    expect(src).toContain("getUserLlmKey3(");
  });
});
