import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/* Lote pantallas-forja-v2 · publico: la landing, el acceso y las imágenes
   generadas hablan Forja v2. Ningún verde fijo (la pátina de antes) y, en CSS y
   componentes, ningún hex suelto: solo tokens. */

const raiz = join(__dirname, "..");
const leer = (r: string) => readFileSync(join(raiz, r), "utf8");

const ESTILO = [
  "src/components/landing/LandingScreen.tsx",
  "src/components/landing/SplitAts.tsx",
  "src/components/landing/DemoIngesta.tsx",
  "src/components/landing/landing.css",
  "src/components/landing/motion.ts",
  "src/components/screens/AuthScreen.tsx",
  "src/components/screens/auth.css",
];
const IMAGENES = ["src/app/icon.tsx", "src/app/apple-icon.tsx", "src/app/opengraph-image.tsx"];

/** Verdes de la paleta pátina anterior, en hex y en rgba. */
const VERDES = [/#43B3A0/i, /#1F6E5A/i, /#5FC6A9/i, /#0A0C0B/i, /#121615/i, /rgba\(\s*95\s*,\s*198\s*,\s*169/];

describe("publico · Forja v2", () => {
  it.each([...ESTILO, ...IMAGENES])("%s no lleva verdes fijos ni tokens de pátina", (f) => {
    const s = leer(f);
    for (const v of VERDES) expect(s, `${f} contiene ${v}`).not.toMatch(v);
    expect(s).not.toMatch(/var\(--(patina-\d+|border-patina|glow-patina)\)/);
  });

  it.each(ESTILO)("%s no tiene hex sueltos (solo tokens)", (f) => {
    // Se ignoran los comentarios: ahí se documentan los ratios medidos.
    const sinComentarios = leer(f)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(sinComentarios).not.toMatch(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b(?![\w-])/i);
  });

  it("la landing se compone con las piezas de src/components/ui", () => {
    const s = leer("src/components/landing/LandingScreen.tsx");
    expect(s).toMatch(/from "@\/components\/ui"/);
    expect(s).toMatch(/<Card material="brasa"/);
    expect(s).toMatch(/<Card material="crema"/);
    expect(s).toMatch(/<Button /);
  });

  it("el acceso es una tarjeta Forja v2 con CTA brasa y conserva Google y GitHub", () => {
    const s = leer("src/components/screens/AuthScreen.tsx");
    expect(s).toMatch(/u-card u-card--grafito u-card--grande au-panel/);
    expect(s).toMatch(/variante="brasa"/);
    expect(s).toMatch(/oauth\("google"\)/);
    expect(s).toMatch(/oauth\("github"\)/);
  });

  it("las imágenes generadas usan los valores de los tokens de brasa", () => {
    for (const f of IMAGENES) {
      const s = leer(f);
      expect(s).toMatch(/#F58C4A/);
      expect(s).toMatch(/#EA6D2C/);
      expect(s).toMatch(/#0E0C0B/);
    }
  });
});
