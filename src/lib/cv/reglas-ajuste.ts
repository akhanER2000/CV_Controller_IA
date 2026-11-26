/**
 * Lo que «Ajustar páginas» lee de las REGLAS de la variante (DA-R1): el contrato de
 * src/lib/cv/reglas.ts, sin más. El ajuste usa tres: paginasMax (el objetivo no la
 * pasa si es obligatoria), incluirSiempre (un recorte jamás quita esos items) y
 * sinFoto (fuera las plantillas de foto). Términos excluidos y secciones ocultas ya
 * los aplica el render (buildVariantResumeData).
 */
export { obtenerReglas, type Reglas } from "./reglas";
