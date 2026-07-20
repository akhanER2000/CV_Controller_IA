/* ============================================================================
   Master · edición de campos y fechas EN SU SITIO (bloque F).

   Estos tests están escritos para ROMPER lo que se acaba de hacer, no para
   aplaudirlo. Los dos que exige el encargo:

   1. Guardar SOLO la fecha no puede borrar el resto del rol. patchMasterItem
      (lib/db/variants.ts) hace .update({ data }) — REEMPLAZA la columna jsonb
      entera, no fusiona. Un PATCH con { dates } a secas deja el rol sin título,
      sin empresa y sin ubicación, y la API responde 200. Ese es el fallo que
      mergeField/mergeDates tienen que hacer imposible.

   2. El atributo data-warn="fechas" tiene que seguir en el DOM después de
      reestructurar la cabecera: es lo ÚNICO que lee el filtro «sin fechas»
      (MasterScreen · useLayoutEffect, `it.querySelector('[data-warn="fechas"]')`).
      Si desaparece, el filtro deja de encontrar los roles sin fecha y no falla
      nada — se rompe en silencio. Aquí se comprueba contra el DOM de verdad.
   ============================================================================ */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

import {
  DateCell,
  MasterScreen,
  ROW_FIELDS,
  ROW_HAS_DATES,
  describeDate,
  mergeDates,
  mergeField,
  roleFieldsFromData,
  rowWarn,
  withPresent,
} from "../src/components/screens/MasterScreen";
import { invalidItemData } from "../src/app/api/master/[id]/route";
import { LangProvider } from "../src/lib/i18n";

/* Un rol como el que devuelve la API: título, empresa, ubicación y NADA de fecha.
   Es literalmente el caso del encargo («Scrum Master — Universidad Andrés Bello»). */
const ROL_SIN_FECHA = {
  title: "Scrum Master",
  company: "Universidad Andrés Bello",
  location: "Santiago",
} as const;

const roleData = () => ({ ...ROL_SIN_FECHA }) as Record<string, unknown>;

// `t` de mentira: devuelve la clave, así un texto sin traducir se ve a simple
// vista. La única con cuerpo es la que INTERPOLA: hay que poder comprobar que el
// rango interpolado es el que se entendió, no la plantilla sin rellenar.
const t = (k: string) => (k === "master.date.understood" ? "entendido: {range}" : k);

describe("mergeField · un campo se guarda SIN llevarse por delante los demás", () => {
  it("editar el cargo conserva empresa y ubicación", () => {
    const next = mergeField(roleData(), "title", "Scrum Master · Ágil");
    expect(next).toEqual({
      title: "Scrum Master · Ágil",
      company: "Universidad Andrés Bello",
      location: "Santiago",
    });
  });

  it("vaciar un campo BORRA esa clave y solo esa (no guarda \"\" fingiendo dato)", () => {
    const next = mergeField(roleData(), "location", "   ");
    expect(next).not.toHaveProperty("location");
    expect(next.title).toBe("Scrum Master");
    expect(next.company).toBe("Universidad Andrés Bello");
  });

  it("no muta la data original (la vista previa sigue siendo restaurable)", () => {
    const original = roleData();
    mergeField(original, "title", "otro");
    expect(original.title).toBe("Scrum Master");
  });

  it("conserva claves que esta pantalla ni pinta (procedencia de la ingesta)", () => {
    const conMeta = { ...roleData(), sourceContext: "CV_2023.pdf", dateByHuman: true };
    const next = mergeField(conMeta, "company", "UNAB");
    expect(next.sourceContext).toBe("CV_2023.pdf");
    expect(next.dateByHuman).toBe(true);
  });
});

describe("mergeDates · EL fallo del encargo: guardar la fecha no vacía el rol", () => {
  it("guardar SOLO la fecha conserva cargo, empresa y ubicación", () => {
    const res = mergeDates(roleData(), "mar 2025 – dic 2025");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Lo que se manda al PATCH es ESTO, entero. Si faltara una clave, el
    // .update({data}) la borraría de la base sin un solo error.
    expect(res.data.title).toBe("Scrum Master");
    expect(res.data.company).toBe("Universidad Andrés Bello");
    expect(res.data.location).toBe("Santiago");
    expect(res.data.dates).toBe("mar 2025 – dic 2025");
  });

  it("registra QUIÉN puso la fecha y qué se entendió de ella", () => {
    const res = mergeDates(roleData(), "mar 2025 – dic 2025");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.dateByHuman).toBe(true); // la fecha la puso una persona, no la IA
    expect(res.data.dateStart).toBe("03/2025");
    expect(res.data.dateEnd).toBe("12/2025");
    expect(res.data.dateCurrent).toBeUndefined();
  });

  it("«2019 – hoy» queda como rango abierto, no como fin en 2019", () => {
    const res = mergeDates(roleData(), "2019 – hoy");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.dateStart).toBe("2019");
    expect(res.data.dateCurrent).toBe(true);
    expect(res.data.dateEnd).toBeUndefined();
  });

  it("un rango imposible NO se guarda: se devuelve el motivo", () => {
    const res = mergeDates(roleData(), "dic 2025 – mar 2025");
    expect(res).toEqual({ ok: false, reason: "invalid" });
  });

  it("un texto que no es fecha NO se guarda como si lo fuera", () => {
    expect(mergeDates(roleData(), "el verano pasado")).toEqual({ ok: false, reason: "unreadable" });
    expect(mergeDates(roleData(), "asdf")).toEqual({ ok: false, reason: "unreadable" });
  });

  it("al fallar no devuelve data: no hay forma de guardar el intento fallido", () => {
    const res = mergeDates(roleData(), "dic 2025 – mar 2025");
    expect(res).not.toHaveProperty("data");
  });

  it("limpia las señales VIEJAS de fecha (un dateInvalid rancio no sobrevive)", () => {
    const sucio = {
      ...roleData(),
      dates: "2023 - 2021",
      dateInvalid: "2023 - 2021",
      dateMissing: true,
      dateEnd: "01/2021",
    } as Record<string, unknown>;
    const res = mergeDates(sucio, "ene 2021 – dic 2023");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.dateInvalid).toBeUndefined();
    expect(res.data.dateMissing).toBeUndefined();
    expect(res.data.dateEnd).toBe("12/2023");
    expect(res.data.title).toBe("Scrum Master"); // y el rol sigue entero
  });

  it("vaciar la fecha la quita y deja constancia de que FALTA (no la inventa)", () => {
    const conFecha = { ...roleData(), dates: "2019 – 2020", dateStart: "2019" } as Record<string, unknown>;
    const res = mergeDates(conFecha, "   ");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.dates).toBeUndefined();
    expect(res.data.dateStart).toBeUndefined();
    expect(res.data.dateMissing).toBe(true);
    expect(res.data.company).toBe("Universidad Andrés Bello");
  });

  it("no muta la data original", () => {
    const original = roleData();
    mergeDates(original, "mar 2025 – dic 2025");
    expect(original).toEqual(ROL_SIN_FECHA);
  });
});

describe("describeDate · lo que se dice haber entendido es lo que se entendió", () => {
  it("vacío no es error, es vacío", () => {
    expect(describeDate("").kind).toBe("empty");
    expect(describeDate("   ").kind).toBe("empty");
  });
  it("una fecha buena se describe con su rango normalizado", () => {
    const h = describeDate("marzo de 2022 - hoy");
    expect(h.kind).toBe("ok");
    if (h.kind !== "ok") return;
    expect(h.range.start).toBe("03/2022");
    expect(h.range.current).toBe(true);
  });
  it("el rango imposible y el ilegible se distinguen (no es el mismo aviso)", () => {
    expect(describeDate("2023 - 2021").kind).toBe("invalid");
    expect(describeDate("cuando pude").kind).toBe("unreadable");
  });
});

describe("withPresent · «sigue abierto» sin romper lo escrito", () => {
  it("añade el término a una fecha de inicio suelta", () => {
    expect(withPresent("mar 2022", "hoy")).toBe("mar 2022 – hoy");
  });
  it("sustituye el término anterior en vez de encadenarlo", () => {
    expect(withPresent("mar 2022 – dic 2023", "hoy")).toBe("mar 2022 – hoy");
    expect(withPresent("mar 2022 – hoy", "hoy")).toBe("mar 2022 – hoy");
  });
  it("NO parte «03-2022» por el guion interno (el bug obvio del split)", () => {
    expect(withPresent("03-2022", "hoy")).toBe("03-2022 – hoy");
    expect(withPresent("2021-03", "present")).toBe("2021-03 – present");
  });
  it("sin inicio no inventa nada", () => {
    expect(withPresent("", "hoy")).toBe("");
    expect(withPresent("   ", "hoy")).toBe("");
  });
});

describe("roleFieldsFromData · una sola derivación, sin gemelos que se desfasen", () => {
  it("un rol sin fecha nace avisado", () => {
    expect(roleFieldsFromData(roleData()).warn).toBe("falta fecha");
  });
  it("un rol con fecha no", () => {
    expect(roleFieldsFromData({ ...roleData(), dates: "2019 – 2020" }).warn).toBeUndefined();
  });
  it("una fecha de solo espacios NO cuenta como fecha", () => {
    expect(roleFieldsFromData({ ...roleData(), dates: "   " }).warn).toBe("falta fecha");
  });
  it("un rol sin título no revienta: devuelve cadena vacía, no 'undefined'", () => {
    expect(roleFieldsFromData({}).tt).toBe("");
    expect(roleFieldsFromData({}).company).toBe("");
  });
});

describe("filas densas · campos de verdad, no un string fusionado", () => {
  it("educación y certificación llevan fecha; un proyecto no (no llega al PDF)", () => {
    expect(ROW_HAS_DATES.education).toBe(true);
    expect(ROW_HAS_DATES.certification).toBe(true);
    expect(ROW_HAS_DATES.project).toBe(false);
    expect(rowWarn("project", {})).toBeUndefined();
    expect(rowWarn("education", {})).toBe("falta fecha");
    expect(rowWarn("education", { dates: "2022" })).toBeUndefined();
  });

  it("un nombre que CONTIENE « — » ya no reparte mal los campos", () => {
    // El bug viejo: tx = "degree — institution" y al guardar se partía por el
    // PRIMER " — ". Con este título se guardaba degree="Ingeniería Civil" e
    // institution="mención Software — UNAB". Ahora cada campo va por su clave.
    const data = { degree: "Ingeniería Civil — mención Software", institution: "UNAB" };
    const next = mergeField(data, "institution", "Universidad Andrés Bello");
    expect(next.degree).toBe("Ingeniería Civil — mención Software");
    expect(next.institution).toBe("Universidad Andrés Bello");
  });

  it("los campos del alta manual y los de la edición son LOS MISMOS", () => {
    // Si divergen, dar de alta y corregir escriben claves distintas y el item
    // acaba con dos juegos de datos.
    expect(ROW_FIELDS.project.map((f) => f.key)).toEqual(["name", "description", "url"]);
    expect(ROW_FIELDS.education.map((f) => f.key)).toEqual(["degree", "institution"]);
    expect(ROW_FIELDS.certification.map((f) => f.key)).toEqual(["name", "issuer"]);
  });
});

/* ── El contrato con el filtro «sin fechas» ────────────────────────────────── */
const cell = (props: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(DateCell, {
      dates: "",
      warnLabel: "falta fecha",
      label: "Scrum Master",
      open: false,
      draft: "",
      t,
      onOpen: () => {},
      onDraft: () => {},
      onSave: () => {},
      onCancel: () => {},
      ...props,
    } as never),
  );

describe("data-warn=\"fechas\" · el filtro «sin fechas» no se rompe en silencio", () => {
  it("un item sin fecha lo lleva", () => {
    expect(cell({ warn: "falta fecha" })).toContain('data-warn="fechas"');
  });

  it("lo sigue llevando con el editor ABIERTO (no se pierde a media edición)", () => {
    const html = cell({ warn: "falta fecha", open: true, draft: "mar 2025" });
    expect(html).toContain('data-warn="fechas"');
  });

  it("un item CON fecha no lo lleva (si no, el filtro los devolvería todos)", () => {
    const html = cell({ dates: "mar 2022 – hoy" });
    expect(html).not.toContain("data-warn");
  });

  it("el aviso es un BOTÓN accionable, no un cartel muerto", () => {
    const html = cell({ warn: "falta fecha" });
    expect(html).toMatch(/<button[^>]*>/);
    expect(html).toContain("master.date.add");
  });

  it("con fecha pero aviso pendiente («falta fecha de término») se puede corregir", () => {
    const html = cell({ dates: "2019 – …", warn: "falta fecha de término", warnLabel: "falta fecha de término" });
    expect(html).toContain('data-warn="fechas"');
    expect(html).toContain("master.date.fix");
  });

  it("abierto: el rango imposible se AVISA y guardar queda deshabilitado", () => {
    const html = cell({ warn: "falta fecha", open: true, draft: "dic 2025 – mar 2025" });
    expect(html).toContain("master.date.invalid");
    expect(html).toContain("disabled");
  });

  it("abierto y vacío: no se puede guardar una fecha que no existe", () => {
    const html = cell({ warn: "falta fecha", open: true, draft: "" });
    expect(html).toContain("disabled");
  });

  it("abierto con fecha válida: guardar está habilitado y dice qué entendió", () => {
    const html = cell({ warn: "falta fecha", open: true, draft: "mar 2025 – dic 2025" });
    expect(html).toContain("entendido: 03/2025 – 12/2025");
    expect(html).not.toContain("disabled");
  });
});

describe("el atributo vive DENTRO del [data-item] del rol (pantalla completa)", () => {
  // Sin Supabase la pantalla monta la maqueta, que trae un rol sin fecha. El
  // filtro busca [data-warn="fechas"] DENTRO de cada [data-item]; si la
  // reestructuración lo hubiera sacado de la tarjeta, aquí se ve.
  const html = renderToStaticMarkup(
    createElement(LangProvider, null, createElement(MasterScreen)),
  );

  it("hay al menos una tarjeta [data-item] con el aviso dentro", () => {
    const cards = html.match(/<article[^>]*data-item[^>]*>[\s\S]*?<\/article>/g) ?? [];
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.some((c) => c.includes('data-warn="fechas"'))).toBe(true);
  });

  it("una fila de educación sin fecha también la lleva DENTRO de su [data-item]", () => {
    const rows = html.match(/<div class="ms-row" data-item[^>]*>[\s\S]*?<\/div><\/div>/g) ?? [];
    expect(rows.some((r) => r.includes('data-warn="fechas"'))).toBe(true);
  });

  it("la cabecera del rol trae los campos editables, no un texto de solo lectura", () => {
    expect(html).toContain('class="ms-ed tt"');
    // company y location ya no viajan fusionadas: cada una es su propio campo.
    expect(html).toMatch(/data-ph="Empresa"[^>]*>Altiplano Pagos SpA</);
    expect(html).toMatch(/aria-label="Editar Ciudad[^"]*"[^>]*>Santiago</);
    expect(html).toMatch(/contenteditable="true"/i);
  });
});

/* ── El PATCH endurecido ───────────────────────────────────────────────────── */
describe("invalidItemData · el PATCH ya no traga cualquier objeto", () => {
  it("acepta lo que esta pantalla manda de verdad", () => {
    const res = mergeDates(roleData(), "mar 2025 – dic 2025");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Integración: el payload del cliente tiene que pasar la validación nueva.
    // Si no, endurecer el PATCH habría roto la edición que acabamos de añadir.
    expect(invalidItemData(res.data)).toBeNull();
    expect(invalidItemData(mergeField(roleData(), "title", "Scrum Master"))).toBeNull();
  });

  it("rechaza un array (el agujero: typeof [] === 'object')", () => {
    expect(invalidItemData([])).not.toBeNull();
    expect(invalidItemData(["title"])).not.toBeNull();
  });

  it("rechaza null y los escalares", () => {
    expect(invalidItemData(null)).not.toBeNull();
    expect(invalidItemData("title")).not.toBeNull();
    expect(invalidItemData(7)).not.toBeNull();
  });

  it("rechaza una clave que el modelo no conoce, y lo DICE", () => {
    const err = invalidItemData({ title: "x", is_admin: true });
    expect(err).toContain("is_admin");
  });

  it("rechaza estructuras anidadas donde solo caben escalares", () => {
    expect(invalidItemData({ title: { $ne: null } })).not.toBeNull();
    expect(invalidItemData({ title: ["a", "b"] })).not.toBeNull();
  });

  it("rechaza un payload desmedido en vez de escribirlo en la base", () => {
    expect(invalidItemData({ text: "x".repeat(70_000) })).not.toBeNull();
  });

  it("los enlaces del contacto: pasa la forma real, cae la inventada", () => {
    expect(invalidItemData({ name: "Diego", links: ["dgatica.cl", { label: "GitHub", url: "github.com/d" }] })).toBeNull();
    expect(invalidItemData({ links: "dgatica.cl" })).not.toBeNull();
    expect(invalidItemData({ links: [{ url: "x", onclick: "alert(1)" }] })).not.toBeNull();
    expect(invalidItemData({ links: [{ url: 42 }] })).not.toBeNull();
  });

  it("acepta las claves que escribe la ingesta (o el master quedaría de solo lectura)", () => {
    expect(invalidItemData({ group: "Herramientas", items: "Go, Python", sourceContext: "Backend Developer" })).toBeNull();
    expect(invalidItemData({ degree: "Ing. Civil", institution: "UNAB", dates: "2014 – 2019", location: "Santiago" })).toBeNull();
    expect(invalidItemData({ name: "idempotency-go", description: "librería", url: "github.com/d/i" })).toBeNull();
    expect(invalidItemData({ dateMissing: true, dateInvalid: "2023 - 2021", dateCurrent: true })).toBeNull();
  });

  it("un objeto vacío es válido: vaciar un item es una decisión del usuario", () => {
    expect(invalidItemData({})).toBeNull();
  });
});
