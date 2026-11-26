import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { PageHeader } from "../src/components/ui/PageHeader";
import { StatusChip } from "../src/components/ui/StatusChip";

/**
 * DA-V5 · coherencia de Forja v2: UNA cabecera de pantalla (PageHeader) y UN
 * chip de estado (StatusChip) en las doce pantallas del área /app. Se valida
 * por USO en el código de cada pantalla, no por la mera existencia de la pieza.
 */

const RAIZ = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

const PANTALLAS: Record<string, string> = {
  Panel: "src/components/screens/DashboardScreen.tsx",
  Master: "src/components/screens/MasterScreen.tsx",
  Revisión: "src/components/screens/StagingScreen.tsx",
  Variantes: "src/components/screens/VariantesScreen.tsx",
  Fuentes: "src/components/screens/FuentesScreen.tsx",
  Importar: "src/components/screens/ImportarScreen.tsx",
  Ingesta: "src/components/screens/IngestaScreen.tsx",
  Adaptar: "src/components/screens/TailorScreen.tsx",
  Ajustes: "src/components/screens/AjustesScreen.tsx",
  "Salud por variante": "src/components/screens/SaludScreen.tsx",
  Onboarding: "src/components/screens/OnboardingScreen.tsx",
  Cuenta: "src/app/app/cuenta/CuentaScreen.tsx",
};

describe("PageHeader en las doce pantallas", () => {
  for (const [nombre, ruta] of Object.entries(PANTALLAS)) {
    it(`${nombre} usa <PageHeader> y ningún <h1> propio`, () => {
      const src = leer(ruta);
      expect(src).toMatch(/<PageHeader\b/);
      expect(src).not.toMatch(/<h1\b/);
      expect(src).not.toMatch(/<CabezaPantalla\b|cuenta\/CabezaPantalla"/);
    });
  }
});

describe("un solo estilo de chip de estado", () => {
  const VIEJOS = [/cu-estado/, /aj-conn-badge/, /vr-chip-draft/, /["`]c-chip/, /<Estado\b/];
  for (const [nombre, ruta] of Object.entries(PANTALLAS)) {
    it(`${nombre} no usa estilos de estado anteriores`, () => {
      const src = leer(ruta);
      for (const v of VIEJOS) expect(src, String(v)).not.toMatch(v);
    });
  }
});

describe("piezas", () => {
  it("PageHeader pinta un h1 con rótulo, subtítulo y acciones", () => {
    const html = renderToStaticMarkup(
      createElement(PageHeader, { titulo: "Ajustes", sub: "Tu perfil", rotulo: "Cuenta", acciones: "x" }),
    );
    expect(html).toContain('<h1 class="u-page-h-t">Ajustes</h1>');
    expect(html).toContain("u-page-h-sub");
    expect(html).toContain("u-page-h-rot");
    expect(html).toContain("u-page-h-acc");
  });

  it("StatusChip lleva punto y texto: el color nunca va solo", () => {
    for (const estado of ["ok", "aviso", "error", "neutro"] as const) {
      const html = renderToStaticMarkup(createElement(StatusChip, { estado, children: "al día" }));
      expect(html).toContain(`u-status--${estado}`);
      expect(html).toContain('class="u-status-p" aria-hidden="true"');
      expect(html).toContain("al día");
    }
  });
});

describe("barra inferior móvil", () => {
  it("el shell reserva su alto con --sh-barra-movil", () => {
    const css = leer("src/components/UserMenu.css");
    expect(css).toMatch(/--sh-barra-movil:\s*0px/);
    expect(css).toMatch(/padding-bottom:\s*var\(--sh-barra-movil\)/);
  });
});

describe("la hoja de cuenta llega a quien usa sus clases", () => {
  // CabezaPantalla y Estado importaban cuenta.css; al apartarlos (DA-CV1) cada
  // pantalla con clases .cu-* la importa ella misma (o vía <Pasos>, que la trae).
  for (const [nombre, ruta] of Object.entries(PANTALLAS)) {
    it(`${nombre}: si usa .cu-*, importa cuenta.css`, () => {
      const src = leer(ruta);
      if (!/className="[^"]*\bcu-/.test(src)) return;
      expect(src).toMatch(/components\/cuenta\/cuenta\.css|components\/cuenta\/Pasos/);
    });
  }
});
