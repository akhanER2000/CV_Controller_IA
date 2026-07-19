/* ============================================================================
   Navegación · origen del botón "volver".

   El bug: /app/importar (y sus hermanas) no tenían salida. La cura es declarar
   el origen en la URL (?from=/app/fuentes) y volver AHÍ — no "al Panel por
   defecto". Este test blinda el helper puro que decide el destino, con especial
   saña en la validación: `from` viaja en la URL, así que es entrada HOSTIL.
   Si alguien logra colar "https://evil.com" o "javascript:…" en un ?from=, el
   botón volver se convierte en un open-redirect con la cara de Corpus.
   ============================================================================ */
import { describe, it, expect } from "vitest";
import {
  ORIGIN_PARAM,
  isInternalAppPath,
  backTarget,
  readOrigin,
  withOrigin,
  backLabelKey,
} from "../src/components/Breadcrumb";

describe("backTarget · ruta válida", () => {
  it("vuelve al origen declarado cuando es una ruta interna de /app", () => {
    expect(backTarget("/app/fuentes", "/app")).toBe("/app/fuentes");
    expect(backTarget("/app/master", "/app")).toBe("/app/master");
    expect(backTarget("/app/variantes/backend-fintech", "/app/variantes")).toBe(
      "/app/variantes/backend-fintech",
    );
  });

  it("acepta el Panel raíz y las rutas con query o hash", () => {
    expect(backTarget("/app", "/app/variantes")).toBe("/app");
    expect(backTarget("/app/fuentes?tab=github", "/app")).toBe("/app/fuentes?tab=github");
    expect(backTarget("/app/master#exp", "/app")).toBe("/app/master#exp");
  });
});

describe("backTarget · origen ausente", () => {
  it("cae al fallback DECLARADO por la pantalla, no al Panel por decreto", () => {
    expect(backTarget(null, "/app/variantes")).toBe("/app/variantes");
    expect(backTarget(undefined, "/app/fuentes")).toBe("/app/fuentes");
    expect(backTarget("", "/app/variantes/x")).toBe("/app/variantes/x");
  });
});

describe("backTarget · origen externo (open-redirect)", () => {
  const externos = [
    "https://evil.com/app",
    "http://evil.com",
    "//evil.com",
    "//evil.com/app/fuentes",
    "/\\evil.com",
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>1</script>",
    "vbscript:msgbox(1)",
    "https://evil.com/?next=/app/fuentes",
    "mailto:alguien@evil.com",
  ];

  it.each(externos)("rechaza %s y usa el fallback", (from) => {
    expect(isInternalAppPath(from)).toBe(false);
    expect(backTarget(from, "/app")).toBe("/app");
  });
});

describe("backTarget · basura", () => {
  const basura: unknown[] = [
    "/login", // ruta interna PERO fuera de /app
    "/auth",
    "/", // la landing pública
    "/appearance", // falso amigo: empieza por "/app" pero no es /app
    "/appfoo",
    "app/fuentes", // sin barra inicial
    " /app/fuentes", // espacios al borde
    "/app/fuentes ",
    "/app/../../etc/passwd",
    "/app/%2e%2e/%2e%2e/",
    "/app/%2Fevil",
    "/app\\fuentes",
    "/app/" + "x".repeat(600), // desmesurado
    42,
    true,
    null,
    undefined,
    {},
    [],
    ["/app/fuentes"],
  ];

  it.each(basura.map((v) => [JSON.stringify(v) ?? String(v), v] as const))(
    "rechaza %s",
    (_etiqueta, from) => {
      expect(isInternalAppPath(from)).toBe(false);
      expect(backTarget(from as string | null, "/app/variantes")).toBe("/app/variantes");
    },
  );

  it("rechaza rutas con caracteres de control", () => {
    expect(isInternalAppPath("/app/fuentes\n")).toBe(false);
    expect(isInternalAppPath("/app/fue\u0000ntes")).toBe(false);
    expect(isInternalAppPath("/app/fuentes\u007f")).toBe(false);
  });
});

describe("readOrigin · lectura desde la query string", () => {
  it("extrae el origen de un search crudo", () => {
    expect(readOrigin("?from=%2Fapp%2Ffuentes", "/app")).toBe("/app/fuentes");
    expect(readOrigin("?source=abc&from=%2Fapp%2Ffuentes", "/app")).toBe("/app/fuentes");
  });

  it("cae al fallback si no hay parámetro, o si el que hay es hostil", () => {
    expect(readOrigin("", "/app/variantes")).toBe("/app/variantes");
    expect(readOrigin("?source=abc", "/app/variantes")).toBe("/app/variantes");
    expect(readOrigin("?from=https%3A%2F%2Fevil.com", "/app")).toBe("/app");
  });
});

describe("withOrigin · decorar enlaces", () => {
  it("añade el origen al href", () => {
    expect(withOrigin("/app/importar", "/app/fuentes")).toBe(
      `/app/importar?${ORIGIN_PARAM}=%2Fapp%2Ffuentes`,
    );
  });

  it("respeta una query preexistente", () => {
    expect(withOrigin("/app/staging?source=abc", "/app/fuentes")).toBe(
      `/app/staging?source=abc&${ORIGIN_PARAM}=%2Fapp%2Ffuentes`,
    );
  });

  it("mantiene el hash al final", () => {
    expect(withOrigin("/app/master#exp", "/app/fuentes")).toBe(
      `/app/master?${ORIGIN_PARAM}=%2Fapp%2Ffuentes#exp`,
    );
  });

  it("no ensucia la URL con un origen inválido", () => {
    expect(withOrigin("/app/importar", "https://evil.com")).toBe("/app/importar");
    expect(withOrigin("/app/importar", "")).toBe("/app/importar");
  });

  it("es idempotente en el ida y vuelta con readOrigin", () => {
    const href = withOrigin("/app/staging?source=abc", "/app/fuentes");
    const search = href.slice(href.indexOf("?"));
    expect(readOrigin(search, "/app")).toBe("/app/fuentes");
  });
});

describe("backLabelKey · nombrar el destino", () => {
  it("mapea las rutas conocidas a su clave de i18n", () => {
    expect(backLabelKey("/app")).toBe("nav.panel");
    expect(backLabelKey("/app/master")).toBe("nav.master");
    expect(backLabelKey("/app/variantes")).toBe("nav.variantes");
    expect(backLabelKey("/app/variantes/backend-fintech")).toBe("nav.variante");
    expect(backLabelKey("/app/variantes/backend-fintech/salud")).toBe("nav.variante");
    expect(backLabelKey("/app/fuentes")).toBe("nav.fuentes");
    expect(backLabelKey("/app/importar")).toBe("nav.importar");
    expect(backLabelKey("/app/staging?source=abc")).toBe("nav.staging");
    expect(backLabelKey("/app/ajustes")).toBe("nav.ajustes");
    expect(backLabelKey("/app/cuenta")).toBe("nav.cuenta");
  });

  it("para una ruta desconocida no inventa un nombre: dice 'Volver'", () => {
    expect(backLabelKey("/app/loquesea")).toBe("nav.back");
  });
});

describe("las claves que usa el botón existen en los dos idiomas", () => {
  it("nav.* del breadcrumb están en ES y EN", async () => {
    const { common } = await import("../src/lib/i18n/dict/common");
    const claves = [
      "nav.panel",
      "nav.master",
      "nav.variantes",
      "nav.variante",
      "nav.fuentes",
      "nav.importar",
      "nav.staging",
      "nav.ajustes",
      "nav.cuenta",
      "nav.back",
      "nav.backTo",
      "nav.breadcrumbAria",
    ];
    for (const k of claves) {
      expect(common.es[k], `falta ES: ${k}`).toBeTruthy();
      expect(common.en[k], `falta EN: ${k}`).toBeTruthy();
    }
    // El aria del botón interpola el destino: el marcador debe seguir ahí.
    expect(common.es["nav.backTo"]).toContain("{destino}");
    expect(common.en["nav.backTo"]).toContain("{destino}");
  });
});
