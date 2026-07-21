import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret, encryptionAvailable, generarClaveMaestra } from "../src/lib/crypto";
import { getUserLlmKey, getUserLlmKey2 } from "../src/lib/account/byok";
import { GET, POST } from "../src/app/api/account/settings/route";

/* ============================================================================
   EL CANDADO DEL CIFRADO BYOK — no es un bug, es el candado.

   Regla inviolable del producto: «ningún secreto se guarda sin cifrar, NUNCA».
   Este test la ataca desde los dos lados:

     1) SIN CORPUS_ENCRYPTION_KEY → la ruta de ajustes NO puede persistir NADA de la
        clave: ni el texto plano, ni una versión "casi cifrada", ni la columna a un
        valor cualquiera. Y el resto de ajustes del mismo POST SÍ se guardan (el
        candado cierra una puerta, no el edificio).
     2) CON CORPUS_ENCRYPTION_KEY → el ciclo entero funciona (guardar → cifrar →
        releer → descifrar) y la clave descifrada NUNCA vuelve al cliente: el GET
        solo dice `hasKey`.

   Los asserts se escriben para MATAR MUTANTES concretos, y varios de ellos se
   comprueban a sí mismos (se inyecta el mutante y se verifica que el detector
   salta). Un test que no puede fallar no prueba nada.

   ⚠ CORPUS_ENCRYPTION_KEY se fija SOLO en process.env de este proceso, con una
     clave generada al vuelo. No se toca .env.local ni ningún fichero real.
   ============================================================================ */

/* ── Supabase falso: guarda las escrituras para poder auditarlas ────────────── */
const h = vi.hoisted(() => {
  const estado = {
    /** la "fila" de user_settings de este usuario */
    fila: {} as Record<string, unknown>,
    /** TODOS los payloads que la ruta intentó escribir, en orden */
    escrituras: [] as Record<string, unknown>[],
    /** simula la migración 0006 sin aplicar (columna llm_api_key_2 inexistente) */
    columna2Ausente: false,
  };

  const crear = () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: "u-1", email: "yo@ejemplo.cl", app_metadata: { provider: "email" } } },
      }),
    },
    from: () => ({
      select: (cols: string) => ({
        eq: () => ({
          maybeSingle: async () => {
            // La 2ª clave se lee en su PROPIA consulta: si la columna no existe,
            // PostgREST devuelve error y solo esa consulta se cae.
            if (estado.columna2Ausente && cols.includes("llm_api_key_2")) {
              return { data: null, error: { message: 'column "llm_api_key_2" does not exist' } };
            }
            return { data: { ...estado.fila }, error: null };
          },
        }),
      }),
      upsert: async (payload: Record<string, unknown>) => {
        estado.escrituras.push({ ...payload });
        Object.assign(estado.fila, payload);
        return { error: null };
      },
    }),
  });

  return { estado, crear };
});

// vitest IZA este mock por encima de los imports: la ruta, al cargarse, ya recibe
// este createClient falso y jamás toca @supabase/ssr ni next/headers.
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => h.crear() }));

const sbFalso = () => h.crear() as unknown as SupabaseClient;

async function post(body: Record<string, unknown>) {
  const req = new Request("http://localhost/api/account/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await POST(req);
  return (await res.json()) as Record<string, unknown>;
}

async function get() {
  const res = await GET();
  return (await res.json()) as Record<string, unknown>;
}

/** ¿Aparece el secreto (o cualquier rastro suyo) en ALGO de lo que se escribió? */
function secretoEnEscrituras(secreto: string): boolean {
  return h.estado.escrituras.some((p) => JSON.stringify(p).includes(secreto));
}

/** ¿Se tocó siquiera la columna del secreto? (una escritura a null también cuenta) */
function columnaTocada(col: string): boolean {
  return h.estado.escrituras.some((p) => col in p);
}

const claveOriginal = process.env.CORPUS_ENCRYPTION_KEY;
beforeEach(() => {
  h.estado.fila = {};
  h.estado.escrituras = [];
  h.estado.columna2Ausente = false;
});
afterAll(() => {
  if (claveOriginal === undefined) delete process.env.CORPUS_ENCRYPTION_KEY;
  else process.env.CORPUS_ENCRYPTION_KEY = claveOriginal;
});

function sinCifrado() {
  delete process.env.CORPUS_ENCRYPTION_KEY;
}
function conCifrado() {
  process.env.CORPUS_ENCRYPTION_KEY = generarClaveMaestra();
}

/* ══════════════════════════════════════════════════════════════════════════
   1 · SIN CIFRADO: no se persiste NADA de la clave
   ══════════════════════════════════════════════════════════════════════════ */
describe("candado · sin CORPUS_ENCRYPTION_KEY no se guarda ningún secreto", () => {
  const SECRETO = "sk-esto-no-puede-tocar-la-base-jamas";

  it("la 1ª clave se APARCA: ni cifrada ni en claro; la columna ni se toca", async () => {
    sinCifrado();
    const r = await post({ llm_api_key: SECRETO });

    expect(r.keyParked).toBe(true); // se dice, no se calla
    expect(r.encryptionAvailable).toBe(false); // …y se dice POR QUÉ
    expect(secretoEnEscrituras(SECRETO)).toBe(false); // mata: patch[k] = String(v)
    expect(columnaTocada("llm_api_key")).toBe(false); // mata: escribir "" o "pendiente"
  });

  it("el detector de secretos NO es decorativo: con un mutante inyectado, salta", () => {
    // Si `secretoEnEscrituras` siempre devolviera false, el test de arriba pasaría
    // aunque la ruta guardara la clave en claro. Se inyecta la escritura que haría
    // el mutante y se comprueba que el detector la ve.
    h.estado.escrituras.push({ user_id: "u-1", llm_api_key: SECRETO });
    expect(secretoEnEscrituras(SECRETO)).toBe(true);
    expect(columnaTocada("llm_api_key")).toBe(true);
  });

  it("el candado cierra UNA puerta: los demás ajustes del mismo POST sí se guardan", async () => {
    sinCifrado();
    await post({ display_name: "Diego", ai_enabled: false, llm_api_key: SECRETO });

    expect(h.estado.fila.display_name).toBe("Diego");
    expect(h.estado.fila.ai_enabled).toBe(false);
    expect(h.estado.fila.llm_api_key).toBeUndefined();
  });

  it("la 2ª clave (Groq) tiene el MISMO candado, en su propia escritura", async () => {
    sinCifrado();
    const r = await post({ llm_api_key_2: "gsk-tampoco-en-claro" });

    expect(r.key2Parked).toBe(true);
    expect(r.key2Unavailable).toBe(false); // la columna existe; el motivo es el cifrado
    expect(secretoEnEscrituras("gsk-tampoco-en-claro")).toBe(false);
    expect(columnaTocada("llm_api_key_2")).toBe(false);
  });

  it("QUITAR la clave sigue permitido sin cifrado (null no es un secreto)", async () => {
    sinCifrado();
    const r = await post({ llm_api_key: "", llm_api_key_2: null });

    expect(r.keyParked).toBe(false);
    expect(r.key2Parked).toBe(false);
    expect(h.estado.fila.llm_api_key).toBeNull();
    expect(h.estado.fila.llm_api_key_2).toBeNull();
  });

  it("GET dice la verdad accionable: encryptionAvailable=false y hasKey=false", async () => {
    sinCifrado();
    await post({ llm_api_key: SECRETO });
    const d = await get();

    expect(d.encryptionAvailable).toBe(false);
    expect(d.hasKey).toBe(false); // nada se guardó: no se finge que sí
    expect(JSON.stringify(d)).not.toContain(SECRETO);
  });

  it("una clave guardada ANTES y hoy indescifrable se marca aparcada (no se finge que sirve)", async () => {
    // Se simula el escenario real: se guardó con cifrado y luego se perdió la maestra.
    conCifrado();
    await post({ llm_api_key: "sk-de-otra-epoca", llm_api_key_2: "gsk-de-otra-epoca" });
    sinCifrado();

    const d = await get();
    expect(d.hasKey).toBe(true);
    expect(d.keyParked).toBe(true); // guardada, pero HOY no se puede usar
    expect(d.key2Parked).toBe(true);
    expect(d.encryptionAvailable).toBe(false);
    // Y el servidor tampoco la usa a ciegas: getUserLlmKey devuelve null.
    expect(await getUserLlmKey(sbFalso(), "u-1")).toBeNull();
    expect(await getUserLlmKey2(sbFalso(), "u-1")).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2 · CON CIFRADO: el ciclo completo, y la clave nunca vuelve al cliente
   ══════════════════════════════════════════════════════════════════════════ */
describe("candado · con CORPUS_ENCRYPTION_KEY el ciclo entero funciona", () => {
  const CLAVE = "sk-mi-clave-real-de-usuario-123";

  it("guardar → cifrar → releer → descifrar, y en la base solo hay un blob v1:", async () => {
    conCifrado();
    const r = await post({ llm_api_key: CLAVE });
    expect(r.keyParked).toBe(false);
    expect(r.encryptionAvailable).toBe(true);

    const guardado = h.estado.fila.llm_api_key as string;
    expect(guardado.startsWith("v1:")).toBe(true); // mata: guardar en claro
    expect(guardado).not.toContain(CLAVE); // mata: base64 o "cifrado" de mentira
    expect(decryptSecret(guardado)).toBe(CLAVE); // releer → descifrar

    // Y el camino REAL del servidor (el que usa la extracción) la recupera igual.
    expect(await getUserLlmKey(sbFalso(), "u-1")).toBe(CLAVE);
  });

  it("★ la clave descifrada NUNCA vuelve al cliente: el GET solo dice hasKey", async () => {
    conCifrado();
    await post({ llm_api_key: CLAVE, llm_api_key_2: "gsk-la-barata-456" });
    const d = await get();
    const crudo = JSON.stringify(d);

    expect(d.hasKey).toBe(true);
    expect(d.hasKey2).toBe(true);
    expect(d.keyParked).toBe(false);
    expect(crudo).not.toContain(CLAVE); // mata: devolver la clave descifrada
    expect(crudo).not.toContain("gsk-la-barata-456");
    expect(crudo).not.toContain("v1:"); // mata: devolver el blob cifrado "que no pasa nada"
    // Mata el mutante más fino: `clave: est2.clave` colado en la respuesta.
    expect(Object.values(d).every((v) => typeof v !== "string" || !v.startsWith("v1:"))).toBe(true);
  });

  it("dos guardados de la MISMA clave dan blobs distintos (IV por cifrado)", async () => {
    conCifrado();
    await post({ llm_api_key: CLAVE });
    const a = h.estado.fila.llm_api_key as string;
    await post({ llm_api_key: CLAVE });
    const b = h.estado.fila.llm_api_key as string;
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(decryptSecret(b));
  });

  it("la 2ª clave se cifra en SU propia escritura, y si la columna falta se dice", async () => {
    conCifrado();
    h.estado.columna2Ausente = true; // migración 0006 sin aplicar
    const d = await get();
    expect(d.key2Unavailable).toBe(true); // degrada con honestidad, no se traga
    expect(d.hasKey2).toBe(false);
  });

  it("cambiar la clave maestra deja el blob viejo ilegible: se aparca, no se usa a medias", async () => {
    conCifrado();
    await post({ llm_api_key: CLAVE });
    conCifrado(); // OTRA maestra: la de antes ya no descifra
    expect(await getUserLlmKey(sbFalso(), "u-1")).toBeNull();
    const d = await get();
    expect(d.hasKey).toBe(true); // hay algo guardado…
    // …pero NO sirve, y se dice: el ✓ optimista («guardada, todo bien») sería mentira
    // justo donde importa. Mata el mutante `keyParked: hasKey && !encryptionAvailable`,
    // que aquí daría false porque cifrado SÍ hay — solo que con otra maestra.
    expect(d.keyParked).toBe(true);
    expect(d.encryptionAvailable).toBe(true);
    expect(JSON.stringify(d)).not.toContain(CLAVE); // …y nada se filtra
  });

  it("un valor NO cifrado colado a mano en la columna se marca aparcado (no se usa en claro)", async () => {
    conCifrado();
    h.estado.fila.llm_api_key = "sk-metida-a-mano-en-la-base";
    const d = await get();
    expect(d.hasKey).toBe(true);
    expect(d.keyParked).toBe(true); // no empieza por "v1:" → jamás se trata como clave
    expect(await getUserLlmKey(sbFalso(), "u-1")).toBeNull();
    expect(JSON.stringify(d)).not.toContain("sk-metida-a-mano-en-la-base");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3 · EL FORMATO DE LA CLAVE MAESTRA Y EL COMANDO DOCUMENTADO

   Dar un comando que genere un valor que el código luego rechaza sería peor que
   no darlo: dejaría al usuario creyendo que configuró el cifrado. Así que aquí se
   EJECUTA el comando tal y como está escrito en .env.local.example.
   ══════════════════════════════════════════════════════════════════════════ */
describe("clave maestra · formato exacto y comando documentado", () => {
  const ejemplo = fileURLToPath(new URL("../.env.local.example", import.meta.url));
  const deploy = fileURLToPath(new URL("../DEPLOY.md", import.meta.url));

  it("32 bytes en base64 valen; 16 bytes y hex-64 NO (el error clásico)", () => {
    process.env.CORPUS_ENCRYPTION_KEY = generarClaveMaestra();
    expect(encryptionAvailable()).toBe(true);

    // `openssl rand -hex 32`: 64 caracteres hex → 48 bytes al leerlos como base64.
    process.env.CORPUS_ENCRYPTION_KEY = "a".repeat(64);
    expect(encryptionAvailable()).toBe(false);

    // Media clave (16 bytes): AES-256 necesita 32. Mata un `>= 16` relajado.
    process.env.CORPUS_ENCRYPTION_KEY = Buffer.alloc(16, 3).toString("base64");
    expect(encryptionAvailable()).toBe(false);

    process.env.CORPUS_ENCRYPTION_KEY = "";
    expect(encryptionAvailable()).toBe(false);
  });

  it("el comando de .env.local.example se EJECUTA y produce una clave que el código acepta", () => {
    const texto = readFileSync(ejemplo, "utf8");
    const m = texto.match(/^#\s*node -e "(.+)"\s*$/m);
    expect(m, "falta el comando `node -e \"…\"` documentado en .env.local.example").toBeTruthy();

    // Se ejecuta el MISMO script que lee el usuario. Sin shell (execFile) para que
    // las comillas del fichero no cambien nada por el camino.
    const salida = execFileSync(process.execPath, ["-e", m![1]!], { encoding: "utf8" }).trim();

    process.env.CORPUS_ENCRYPTION_KEY = salida;
    expect(encryptionAvailable()).toBe(true);
    expect(Buffer.from(salida, "base64")).toHaveLength(32);
    // Y sirve de verdad, no solo "es válida": ciclo completo con ella.
    expect(decryptSecret(encryptSecret("sk-x"))).toBe("sk-x");
  });

  it("las dos variables que faltaban están documentadas donde toca", () => {
    const texto = readFileSync(ejemplo, "utf8");
    expect(texto).toContain("CORPUS_ENCRYPTION_KEY");
    expect(texto).toContain("openssl rand -base64 32"); // la alternativa, también válida
    expect(texto).toContain("GROQ_API_KEY"); // faltaba entera
    expect(texto).toContain("console.groq.com/keys"); // dónde se obtiene
    expect(readFileSync(deploy, "utf8")).toContain("CORPUS_ENCRYPTION_KEY");
  });
});
