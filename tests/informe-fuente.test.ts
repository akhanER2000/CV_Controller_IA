import { describe, it, expect } from "vitest";
import {
  bucketStagedBySource,
  type StagedTallyRow,
} from "../src/lib/db/staging-counts";
import {
  resumirEventos,
  EVENTO_CONSUMO,
  EVENTO_CONTEXTO,
  type EventoRow,
} from "../src/lib/db/queries";
import { matchStagedAgainstMaster, type MasterItemLite } from "../src/lib/db/sources";
import { EVENTO } from "../src/lib/db/telemetria";
import type { StagedRow } from "../src/lib/extract/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * INFORME POR FUENTE (bloque D) — que el usuario CONFÍE en que una fuente entró
 * completa SIN auditar el master a mano.
 *
 * Se prueban las TRES piezas puras del informe, cada una con mutantes (entradas
 * que intentan colar un número inventado o descartar un dato en silencio, y se
 * comprueba que el conteo/veredicto los mata):
 *   1. bucketStagedBySource — el recuento por fuente del staging.
 *   2. resumirEventos       — la telemetría (llamadas/tokens/contexto) por fuente.
 *   3. matchStagedAgainstMaster — no re-proponer al releer lo que ya está aceptado.
 * ════════════════════════════════════════════════════════════════════════════
 */

/* ── util: una fila del staging, con lo que el recuento mira ──────────────────── */
const row = (
  sourceId: string | null,
  pending: boolean,
  verified: boolean,
  suspect: boolean,
): StagedTallyRow => ({ sourceId, pending, verified, suspect });

describe("bucketStagedBySource · recuento por fuente, con los ejes correctos", () => {
  it("agrupa por fuente y separa lo abierto de lo ya resuelto", () => {
    const out = bucketStagedBySource([
      row("A", true, true, false), // pendiente, con evidencia, no dup
      row("A", true, false, true), // pendiente, sin evidencia, dup
      row("A", false, false, false), // aceptado/rechazado: cuenta en items, no en pending
      row("B", true, true, false),
    ]);
    // items = TODAS las filas de la fuente (cualquier estado)
    expect(out.A.items).toBe(3);
    expect(out.B.items).toBe(1);
    // pending = solo las abiertas
    expect(out.A.pending).toBe(2);
    // duplicados y sin-evidencia SOLO sobre lo pendiente
    expect(out.A.duplicates).toBe(1);
    expect(out.A.withoutEvidence).toBe(1);
    expect(out.B.duplicates).toBe(0);
    expect(out.B.withoutEvidence).toBe(0);
  });

  it("MUTANTE: un duplicado YA RESUELTO (no pendiente) no infla la cifra", () => {
    // Un item aceptado que en su día trajo sospecha NO debe contar como «posible
    // duplicado»: la duda ya se zanjó. Si se contara sobre todos los estados en vez
    // de solo pending, este test caería.
    const out = bucketStagedBySource([
      row("A", false, true, true), // aceptado, marcado suspect: NO cuenta como dup abierto
    ]);
    expect(out.A.items).toBe(1);
    expect(out.A.pending).toBe(0);
    expect(out.A.duplicates).toBe(0);
    expect(out.A.withoutEvidence).toBe(0);
  });

  it("MUTANTE: una fila sin fuente no se atribuye a nadie (no se inventa una)", () => {
    const out = bucketStagedBySource([row(null, true, false, true)]);
    expect(Object.keys(out)).toHaveLength(0);
  });

  it("sin evidencia se cuenta por !verified, no por otra cosa", () => {
    const out = bucketStagedBySource([
      row("A", true, false, false),
      row("A", true, false, false),
      row("A", true, true, false),
    ]);
    expect(out.A.withoutEvidence).toBe(2); // las dos sin verificar, no la verificada
  });
});

/* ── util: un evento de ingesta crudo ────────────────────────────────────────── */
const consumo = (id: number, source: string, p: Record<string, unknown>): EventoRow => ({
  id,
  sourceId: source,
  message: EVENTO_CONSUMO,
  payload: p,
});
const contexto = (id: number, source: string, p: Record<string, unknown>): EventoRow => ({
  id,
  sourceId: source,
  message: EVENTO_CONTEXTO,
  payload: p,
});

describe("resumirEventos · telemetría por fuente, leyendo lo que de verdad hay", () => {
  it("las claves de evento coinciden con las que escribe telemetria.ts (anti-deriva)", () => {
    // Si allá renombran EVENTO.*, el lector dejaría de encontrar los eventos y el
    // informe se quedaría mudo EN SILENCIO. Este ancla los dos lados.
    expect(EVENTO_CONSUMO).toBe(EVENTO.consumo);
    expect(EVENTO_CONTEXTO).toBe(EVENTO.contexto);
  });

  it("saca llamadas, caracteres y tokens del evento de consumo", () => {
    const out = resumirEventos([
      consumo(10, "A", {
        llamadas: 8,
        tokensEntrada: 12000,
        tokensSalida: 400,
        caracteresDocumento: 106_000,
        llamadasSinUso: 0,
        desdeCache: false,
      }),
    ]);
    expect(out.A.aiCalls).toBe(8);
    expect(out.A.charsRead).toBe(106_000);
    expect(out.A.tokens).toBe(12_400);
    expect(out.A.tokensAreFloor).toBe(false);
    expect(out.A.fromCache).toBe(false);
  });

  it("con llamadasSinUso>0 los tokens son un SUELO (se marca floor)", () => {
    const out = resumirEventos([
      consumo(1, "A", { llamadas: 3, tokensEntrada: 500, tokensSalida: 0, llamadasSinUso: 2 }),
    ]);
    expect(out.A.tokens).toBe(500);
    expect(out.A.tokensAreFloor).toBe(true);
  });

  it("MUTANTE: gana el evento MÁS RECIENTE (mayor id), no el primero ni la suma", () => {
    // Releer añade un consumo nuevo. La tarjeta refleja la ÚLTIMA ingesta —la que
    // produjo el staging actual—, no la vieja ni el total acumulado.
    const out = resumirEventos([
      consumo(1, "A", { llamadas: 20, caracteresDocumento: 999 }),
      consumo(9, "A", { llamadas: 8, caracteresDocumento: 106_000 }),
    ]);
    expect(out.A.aiCalls).toBe(8); // la reciente, no 20 ni 28
    expect(out.A.charsRead).toBe(106_000);
  });

  it("una fuente sin evento de consumo (p. ej. GitHub) deja los números en null", () => {
    const out = resumirEventos([
      contexto(5, "G", { total: 0, caracteres: 0, secciones: [] }),
    ]);
    expect(out.G.aiCalls).toBeNull();
    expect(out.G.charsRead).toBeNull();
    expect(out.G.tokens).toBeNull();
    expect(out.G.contextSections).toEqual([]);
  });

  it("las secciones de contexto viajan CON NOMBRE (qué quedó fuera, persistido)", () => {
    const out = resumirEventos([
      contexto(3, "A", {
        total: 2,
        secciones: [
          { titulo: "Tu historia", caracteres: 4000 },
          { titulo: "Preguntas incómodas", caracteres: 2500 },
        ],
      }),
    ]);
    expect(out.A.contextSections).toEqual([
      { titulo: "Tu historia", caracteres: 4000 },
      { titulo: "Preguntas incómodas", caracteres: 2500 },
    ]);
  });

  it("MUTANTE: un payload con otra forma degrada a null/vacío, no revienta ni adivina", () => {
    const out = resumirEventos([
      { id: 1, sourceId: "A", message: EVENTO_CONSUMO, payload: "no soy un objeto" },
      { id: 2, sourceId: "A", message: EVENTO_CONSUMO, payload: { llamadas: "ocho" as unknown as number } },
      { id: 3, sourceId: "A", message: "otra.cosa", payload: { llamadas: 99 } },
    ]);
    // el payload objeto (id 2) gana por id; llamadas no es número → null
    expect(out.A.aiCalls).toBeNull();
    expect(out.A.charsRead).toBeNull();
    // el mensaje ajeno (id 3) jamás se cuela
    expect(out.A.tokens).toBeNull();
  });
});

/* ── util: una StagedRow mínima ──────────────────────────────────────────────── */
const staged = (key: string, kind: StagedRow["kind"], data: Record<string, unknown>): StagedRow => ({
  key,
  kind,
  data,
  lang: "es",
  origin: "extracted",
  sourceLabel: "texto",
  evidenceSnippet: null,
  evidenceLevel: "partial",
  evidenceVerified: false,
});

describe("matchStagedAgainstMaster · releer no re-propone a ciegas lo ya aceptado", () => {
  it("casa un rol ya en el master (misma empresa, fechas que se solapan)", () => {
    const master: MasterItemLite[] = [
      { id: "pi-1", kind: "work", data: { title: "Backend Developer", company: "Altiplano", dates: "2020 – 2022" } },
    ];
    const rows = [staged("w1", "work", { title: "Backend Developer", company: "Altiplano", dates: "2021 – 2023" })];
    const m = matchStagedAgainstMaster(master, rows);
    expect(m.get("w1")).toBe("pi-1");
  });

  it("casa por NOMBRE los kinds cuya identidad es el nombre (skill, project)", () => {
    const master: MasterItemLite[] = [
      { id: "pi-sk", kind: "skill", data: { group: "Lenguajes", items: "Go, Python" } },
      { id: "pi-pr", kind: "project", data: { name: "conciliador-api", description: "protos" } },
    ];
    const rows = [
      staged("s1", "skill", { group: "Lenguajes", items: "Go, SQL" }),
      staged("p1", "project", { name: "conciliador-api", description: "OpenAPI" }),
    ];
    const m = matchStagedAgainstMaster(master, rows);
    expect(m.get("s1")).toBe("pi-sk");
    expect(m.get("p1")).toBe("pi-pr");
  });

  it("MUTANTE: una PROMOCIÓN interna (mismo sitio, cargo distinto) NO se marca", () => {
    // Marcar esto como «ya está» borraría media carrera del usuario al releer. El
    // matcher tiene que ser CONSERVADOR: distinto cargo en la misma empresa son dos
    // entradas legítimas, no un duplicado.
    const master: MasterItemLite[] = [
      { id: "pi-1", kind: "work", data: { title: "Backend Developer", company: "Altiplano", dates: "2020 – 2022" } },
    ];
    const rows = [staged("w1", "work", { title: "Engineering Manager", company: "Altiplano", dates: "2020 – 2022" })];
    const m = matchStagedAgainstMaster(master, rows);
    expect(m.has("w1")).toBe(false);
  });

  it("MUTANTE: un item NUEVO (no está en el master) no se marca — no se pierde", () => {
    const master: MasterItemLite[] = [
      { id: "pi-1", kind: "skill", data: { group: "Lenguajes", items: "Go" } },
    ];
    const rows = [staged("s2", "skill", { group: "Infraestructura", items: "Docker, k8s" })];
    const m = matchStagedAgainstMaster(master, rows);
    expect(m.size).toBe(0);
  });

  it("kinds sin identidad sólida (education) no se marcan; master vacío da mapa vacío", () => {
    const master: MasterItemLite[] = [
      { id: "pi-e", kind: "education", data: { degree: "Ing. Civil", institution: "UNAB" } },
    ];
    const rows = [staged("e1", "education", { degree: "Ing. Civil", institution: "UNAB" })];
    expect(matchStagedAgainstMaster(master, rows).size).toBe(0);
    expect(matchStagedAgainstMaster([], rows).size).toBe(0);
  });
});
