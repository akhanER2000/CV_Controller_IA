-- 0009 · objetivo de páginas por variante + reparación de viñetas huérfanas (DA-PD9)
--
-- IDEMPOTENTE: se puede correr las veces que haga falta. La columna se agrega solo
-- si falta, y la reparación solo toca viñetas que SIGUEN huérfanas y cuyo rol se
-- puede determinar SIN AMBIGÜEDAD. Lo que no se puede determinar, no se adivina.

-- ── 1 · cv_variants.paginas_objetivo ────────────────────────────────────────
-- Antes vivía en localStorage (corpus.paginas.<id>): no sobrevivía a otro
-- navegador. 1 a 3 páginas; 2 es lo que el editor ya suponía por defecto.
alter table cv_variants
  add column if not exists paginas_objetivo smallint not null default 2
  constraint cv_variants_paginas_objetivo_check check (paginas_objetivo between 1 and 3);

-- ── 2 · viñetas huérfanas → su rol ──────────────────────────────────────────
-- DA-PD9: el .md importado enlazaba la viñeta a su rol por `parentIndex` y la
-- capa de staging solo leía `parentKey`; las viñetas llegaron al master con
-- parent_id nulo (el Master contaba 42 y el Panel 71).

-- 2a · Por STAGING: la viñeta salió de un staged cuyo padre staged ya está en el
--      master. Es el enlace exacto que la promoción debió escribir.
update profile_items b
   set parent_id = w.id
  from staged_items s
  join staged_items p on p.id = s.parent_staged_id
  join profile_items w on w.id = p.promoted_to
 where b.kind = 'bullet'
   and b.parent_id is null
   and s.promoted_to = b.id
   and s.user_id = b.user_id
   and w.user_id = b.user_id
   and w.profile_id = b.profile_id
   and w.kind in ('work', 'project', 'publication', 'education');

-- 2b · Por la FUENTE: el raw_text del .md guarda el rol. Una viñeta «- texto»
--      cuelga del «### rótulo» más cercano por encima, sin otra «## SECCIÓN» en
--      medio (la regla del parser). Solo se enlaza si:
--        · la línea «- texto» aparece UNA sola vez en el raw_text,
--        · la cabecera más cercana por encima es un «###» (no un «##»),
--        · hay EXACTAMENTE UN item del master, de la misma fuente y del mismo
--          usuario, cuyo campo de cabecera es ese rótulo.
--      Cualquier otra cosa (texto con escapes, viñetas multilínea, rótulos
--      repetidos) se queda huérfana: ver el SELECT de diagnóstico al final.
with huerfanas as (
  select b.id, b.user_id, b.profile_id, b.source_id, btrim(b.data->>'text') as txt
    from profile_items b
   where b.kind = 'bullet'
     and b.parent_id is null
     and b.source_id is not null
     and coalesce(btrim(b.data->>'text'), '') <> ''
),
lineas as (
  select src.id as source_id, l.n, l.linea
    from ingestion_sources src
    cross join lateral regexp_split_to_table(coalesce(src.raw_text, ''), E'\r?\n') with ordinality as l(linea, n)
   where src.id in (select source_id from huerfanas)
),
posicion as (
  select h.id, h.user_id, h.profile_id, h.source_id, min(l.n) as n
    from huerfanas h
    join lineas l
      on l.source_id = h.source_id
     and l.linea ~ '^\s*[-*]'
     and btrim(regexp_replace(l.linea, '^\s*[-*]\s?', '')) = h.txt
   group by h.id, h.user_id, h.profile_id, h.source_id
  having count(*) = 1
),
cabecera as (
  select p.*,
         (select l.linea
            from lineas l
           where l.source_id = p.source_id and l.n < p.n and l.linea ~ '^\s*##'
           order by l.n desc
           limit 1) as linea_cab
    from posicion p
),
rotulo as (
  select c.id, c.user_id, c.profile_id, c.source_id,
         btrim(regexp_replace(regexp_replace(c.linea_cab, '^\s*###\s*', ''), '\s*#*\s*$', '')) as rot
    from cabecera c
   where c.linea_cab ~ '^\s*###'
),
candidato as (
  select r.id as bullet_id, min(w.id::text)::uuid as rol_id
    from rotulo r
    join profile_items w
      on w.user_id = r.user_id
     and w.profile_id = r.profile_id
     and w.source_id = r.source_id
     and w.kind in ('work', 'project', 'publication', 'education')
     and r.rot <> ''
     and btrim(case w.kind when 'work' then w.data->>'title'
                           when 'education' then w.data->>'degree'
                           else w.data->>'name' end) = r.rot
   group by r.id
  having count(*) = 1
)
update profile_items b
   set parent_id = c.rol_id
  from candidato c
 where b.id = c.bullet_id
   and b.parent_id is null;

-- ── Diagnóstico (NO se ejecuta): las viñetas que siguen huérfanas tras 2a y 2b.
--    Su rol no es determinable sin adivinar; se recolocan a mano desde el Master.
-- select b.id, b.user_id, b.source_id, b.data->>'text' as texto, src.original_name
--   from profile_items b
--   left join ingestion_sources src on src.id = b.source_id
--  where b.kind = 'bullet' and b.parent_id is null
--  order by b.user_id, src.original_name, b.created_at;
