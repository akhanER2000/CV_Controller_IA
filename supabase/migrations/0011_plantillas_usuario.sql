-- 0011 · plantillas a medida del usuario (DA-A1, paso 3 de «Ajustar páginas»)
--
-- IDEMPOTENTE: se puede correr las veces que haga falta.
--
-- Una plantilla a medida NO es diseño nuevo: es una plantilla del catálogo
-- (`base_template_id`, de una columna) más los parámetros que el MOTOR eligió
-- dentro de los límites ATS (`params`: cuerpo, interlineado, márgenes, espacios,
-- escala de títulos, paleta y pareja registradas). El documento la pide con el id
-- "u:<id>" y el servidor la resuelve (src/lib/cv/plantillas-usuario.ts).
--
-- Borrar una plantilla no rompe las variantes que la usaban: un id "u:…" que ya no
-- existe cae en la plantilla por defecto, como cualquier id desconocido.

create table if not exists plantillas_usuario (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  nombre           text not null default 'A medida',
  base_template_id text not null,
  params           jsonb not null,
  created_at       timestamptz not null default now()
);

create index if not exists plantillas_usuario_user_idx on plantillas_usuario (user_id, created_at desc);

alter table plantillas_usuario enable row level security;

-- Solo el dueño ve, crea, renombra y borra sus plantillas.
drop policy if exists "own plantillas" on plantillas_usuario;
create policy "own plantillas" on plantillas_usuario
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
