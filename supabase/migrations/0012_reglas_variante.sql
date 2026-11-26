-- 0012 · reglas por variante (DA-R1)
--
-- IDEMPOTENTE: se puede correr las veces que haga falta.
--
-- Las REGLAS que el usuario fija al crear una variante (o desde el editor) y que
-- nada rompe: ni «Crear con IA», ni «Analizar la oferta», ni «Afinar», ni
-- «Ajustar». Forma (la normaliza src/lib/cv/reglas.ts al leer; '{}' = sin reglas):
--   { paginasMax: 1|2|3|null, incluirSiempre: [ids del master],
--     excluirTerminos: [texto], ocultarSecciones: [SectionId], sinFoto: bool,
--     idioma: "es"|"en"|null, notas: texto,
--     fuerza: { <regla>: "obligatoria"|"preferida" } }
--
-- Sin esta columna la app degrada honesta: las variantes se leen sin reglas y
-- guardarlas responde persistido:false (mismo criterio que paginas_objetivo, 0009).

alter table cv_variants
  add column if not exists reglas jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cv_variants_reglas_objeto_check'
  ) then
    alter table cv_variants
      add constraint cv_variants_reglas_objeto_check check (jsonb_typeof(reglas) = 'object');
  end if;
end $$;
