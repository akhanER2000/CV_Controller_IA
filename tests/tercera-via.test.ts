import { describe, it, expect } from "vitest";
import { plantillaVacia, parsearCorpusMd } from "@/lib/corpus-md";

/* Simula la TERCERA VÍA: descargo la plantilla, se la doy a mi ChatGPT con mi CV,
   pego lo que devuelve en Corpus. Cero tokens de API de Corpus. */
describe("★ la tercera vía, de punta a punta", () => {
  it("plantilla -> rellenada por un chat externo -> parseada sin IA", () => {
    const plantilla = plantillaVacia();

    // Lo que devolvería un modelo externo respetando la plantilla: sustituye los
    // [corchetes] y borra lo que no sabe. Ni un campo inventado.
    const rellenada = plantilla
      .replace("[Tu nombre completo]", "Akhan Lorenzo Espinoza Rojas")
      .replace("[Tu título profesional, p. ej. AI/ML Engineer]", "AI/ML Engineer · Applied Scientist")
      .replace("[tu@correo.cl]", "castrolorenzosegundo@gmail.com")
      .replace("[+56 9 0000 0000]", "+56 9 5612 1922")
      .replace("[Ciudad, País]", "Valparaíso, Chile")
      .replace("[https://www.linkedin.com/in/usuario]", "https://linkedin.com/in/akhan-espinoza")
      .replace("[https://github.com/usuario]", "https://github.com/akhanER2000")
      .replace(/\[Dos o tres líneas.*?\]/s, "Ingeniero Civil en Computación especializado en IA aplicada a dominios regulados.")
      .replace("[Tu cargo] — [Empresa]", "Founder & AI Engineer — PharmIQ")
      .replace("empresa: [Empresa]", "empresa: PharmIQ")
      .replace("ubicacion: [Ciudad, País]", "ubicacion: Valparaíso, Chile")
      .replace("[2024-01]", "2026-04")
      .replace("[actualidad]", "actualidad")
      .replace(/- \[Un logro concreto.*?\]/s, "- Diseñé un asistente RAG anclado a la reglamentación del MINSAL.")
      .replace(/- \[Otro logro.*?\]/s, "- Construí gestión de inventario con alertas por correo.")
      .replace("[Lenguajes]: [Python, TypeScript, SQL]", "Lenguajes: Python, TypeScript, C#, SQL")
      .replace("[Herramientas]: [Docker, Git, PostgreSQL]", "IA y LLMs: RAG, LangChain, Ollama, ChromaDB")
      .replace("[Tu título]", "Ingeniería Civil en Computación")
      .replace("institucion: [Universidad]", "institucion: Universidad Andrés Bello")
      .replace("[2020-03]", "2022-03")
      .replace("[2024-12]", "2026-11");

    const r = parsearCorpusMd(rellenada);

    console.log("\n=== TERCERA VÍA ===");
    console.log("ok:", r.ok, "· formato:", r.formato);
    console.log("resumen:", JSON.stringify(r.resumen));
    console.log("avisos:", r.avisos.length);
    r.avisos.slice(0, 6).forEach(a => console.log(`  línea ${a.linea}: ${a.mensaje}${a.sugerencia ? " → " + a.sugerencia : ""}`));

    const basics = r.items.find(i => i.kind === "basics")!;
    const work = r.items.filter(i => i.kind === "work");
    const bullets = r.items.filter(i => i.kind === "bullet");
    const skills = r.items.filter(i => i.kind === "skill");

    console.log("nombre:", basics.data.name);
    console.log("enlaces:", JSON.stringify(basics.data.links));
    console.log("rol:", work[0]?.data.title, "@", work[0]?.data.company, "·", work[0]?.data.dates);
    console.log("viñetas:", bullets.length, "· grupos de skills:", skills.map(s => s.data.group).join(" / "));

    expect(r.ok).toBe(true);
    expect(basics.data.name).toBe("Akhan Lorenzo Espinoza Rojas");
    expect(work[0]!.data.company).toBe("PharmIQ");
    // ★ Todo lo escrito a mano entra como manual y verificado: el fichero ES la fuente.
    expect(basics.origin ?? "manual").toBe("manual");
    expect(bullets.length).toBeGreaterThanOrEqual(2);
    // ★ El problema de clasificación no aparece: lo de HABILIDADES es habilidad.
    expect(skills.map(s => s.data.group)).toContain("Lenguajes");
    expect(skills.map(s => s.data.group)).toContain("IA y LLMs");
  });
});
