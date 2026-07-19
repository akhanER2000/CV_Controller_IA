import { describe, it, expect } from "vitest";
import {
  fileKindFromName,
  safeStorageName,
  isOwnedPath,
  parseGithubHandle,
  githubSourceUrl,
  sourceInsert,
  splitStaged,
  parentRow,
  bulletRow,
} from "../src/lib/db/sources";
import type { StagedRow } from "../src/lib/extract/types";

/**
 * Helpers PUROS de la capa de fuentes (agente B) — sin Supabase vivo. Cubren lo que
 * gobierna la ingesta in situ: extensión→tipo, saneo de nombre de Storage, guardia de
 * ruta del usuario, normalización del handle de GitHub, y el armado de las filas de
 * staged_items en DOS FASES (padres → viñetas con parent_staged_id).
 */

describe("fileKindFromName · extensión/MIME → tipo soportado", () => {
  it("detecta pdf, docx e imágenes", () => {
    expect(fileKindFromName("CV_2023.pdf")).toBe("pdf");
    expect(fileKindFromName("perfil.docx")).toBe("docx");
    expect(fileKindFromName("captura.PNG")).toBe("image");
    expect(fileKindFromName("foto.jpg")).toBe("image");
    expect(fileKindFromName("foto.jpeg")).toBe("image");
    expect(fileKindFromName("shot.webp")).toBe("image");
  });
  it("usa el MIME cuando el nombre no basta", () => {
    expect(fileKindFromName("sin-extension", "application/pdf")).toBe("pdf");
    expect(fileKindFromName("captura", "image/png")).toBe("image");
  });
  it("rechaza lo no soportado: .doc binario, .txt, .key", () => {
    expect(fileKindFromName("viejo.doc")).toBeNull();
    expect(fileKindFromName("notas.txt")).toBeNull();
    expect(fileKindFromName("archivo")).toBeNull();
  });
});

describe("safeStorageName · clave de Storage segura", () => {
  it("conserva la extensión y sanea el resto", () => {
    expect(safeStorageName("Mi CV (final).pdf")).toBe("Mi_CV_final_.pdf");
    expect(safeStorageName("perfil.DOCX")).toBe("perfil.docx");
  });
  it("nunca queda vacío", () => {
    expect(safeStorageName("")).toBe("archivo");
    expect(safeStorageName(".pdf").endsWith(".pdf")).toBe(true);
  });
});

describe("isOwnedPath · defensa en profundidad del path", () => {
  const uid = "11111111-1111-1111-1111-111111111111";
  it("acepta solo rutas que empiezan por el id del usuario", () => {
    expect(isOwnedPath(`${uid}/abc/CV.pdf`, uid)).toBe(true);
    expect(isOwnedPath(`otro-usuario/abc/CV.pdf`, uid)).toBe(false);
    expect(isOwnedPath(`../${uid}/x`, uid)).toBe(false);
  });
});

describe("parseGithubHandle · normaliza cualquier forma de usuario", () => {
  it("acepta handle limpio, con @, y URLs", () => {
    expect(parseGithubHandle("dgatica")).toBe("dgatica");
    expect(parseGithubHandle("@dgatica")).toBe("dgatica");
    expect(parseGithubHandle("github.com/dgatica")).toBe("dgatica");
    expect(parseGithubHandle("https://github.com/dgatica")).toBe("dgatica");
    expect(parseGithubHandle("https://www.github.com/dgatica/idempotency-go")).toBe("dgatica");
    expect(parseGithubHandle("  dgatica  ")).toBe("dgatica");
  });
  it("rechaza lo inválido", () => {
    expect(parseGithubHandle("")).toBeNull();
    expect(parseGithubHandle(null)).toBeNull();
    expect(parseGithubHandle("con espacio")).toBeNull();
    expect(parseGithubHandle("-mal")).toBeNull();
    expect(parseGithubHandle("mal-")).toBeNull();
    expect(parseGithubHandle("a".repeat(40))).toBeNull();
  });
  it("githubSourceUrl arma el source_url canónico", () => {
    expect(githubSourceUrl("dgatica")).toBe("github.com/dgatica");
  });
});

describe("sourceInsert · fila de ingestion_sources con defaults honestos", () => {
  it("parametriza la procedencia y rellena defaults", () => {
    const row = sourceInsert("u1", {
      kind: "pdf",
      originalName: "CV.pdf",
      storagePath: "u1/abc/CV.pdf",
      pageCount: 2,
      rawText: "texto",
      rawTextIsTranscription: true,
    });
    expect(row).toEqual({
      user_id: "u1",
      kind: "pdf",
      original_name: "CV.pdf",
      source_url: null,
      storage_path: "u1/abc/CV.pdf",
      status: "extracted",
      page_count: 2,
      raw_text: "texto",
      raw_text_is_transcription: true,
      error: null,
    });
  });
  it("status por defecto 'extracted' y transcripción por defecto false", () => {
    const row = sourceInsert("u1", { kind: "paste", rawText: "hola" });
    expect(row.status).toBe("extracted");
    expect(row.raw_text_is_transcription).toBe(false);
    expect(row.storage_path).toBeNull();
  });
});

describe("armado de staged_items en dos fases (padres → viñetas)", () => {
  const work: StagedRow = {
    key: "w1",
    kind: "work",
    data: { title: "Backend Developer", company: "Altiplano" },
    lang: "es",
    origin: "extracted",
    sourceLabel: "texto pegado",
    evidenceSnippet: "Backend Developer en Altiplano",
    evidenceLevel: "verified",
    evidenceVerified: true,
  };
  const bullet: StagedRow = {
    key: "b1",
    parentKey: "w1",
    kind: "bullet",
    data: { text: "Reduje la latencia un 38%." },
    lang: "es",
    origin: "extracted",
    sourceLabel: "texto pegado",
    evidenceSnippet: "reduje la latencia un 38%",
    evidenceLevel: "partial",
    evidenceVerified: false,
  };

  it("splitStaged separa viñetas de padres conservando el orden", () => {
    const { parents, bullets } = splitStaged([work, bullet]);
    expect(parents.map((r) => r.key)).toEqual(["w1"]);
    expect(bullets.map((r) => r.key)).toEqual(["b1"]);
  });

  it("parentRow lleva la procedencia en data._* y status pending", () => {
    const row = parentRow("u1", "src1", work);
    expect(row.user_id).toBe("u1");
    expect(row.source_id).toBe("src1");
    expect(row.kind).toBe("work");
    expect(row.status).toBe("pending");
    expect(row.evidence_verified).toBe(true);
    expect(row.data).toMatchObject({
      title: "Backend Developer",
      company: "Altiplano",
      _origin: "extracted",
      _level: "verified",
      _source: "texto pegado",
    });
    // un padre no lleva parent_staged_id
    expect("parent_staged_id" in row).toBe(false);
  });

  it("bulletRow apunta a su rol ya insertado (parent_staged_id)", () => {
    const row = bulletRow("u1", "src1", bullet, "parent-uuid");
    expect(row.parent_staged_id).toBe("parent-uuid");
    expect(row.kind).toBe("bullet");
    expect(row.data).toMatchObject({ text: "Reduje la latencia un 38%.", _origin: "extracted" });
  });

  it("una viñeta huérfana (parent no resuelto) queda con parent_staged_id null", () => {
    const row = bulletRow("u1", "src1", bullet, null);
    expect(row.parent_staged_id).toBeNull();
  });
});
