-- ============================================================================
-- Corpus · 0005_reference_links.sql
-- El VÍNCULO de una referencia con el trabajo que la respalda.
--
-- La tesis: una referencia no vale por sí sola, vale por el proyecto o el rol en
-- el que trabajasteis juntos. Por eso no basta con guardar a la persona: hay que
-- guardar CON QUÉ se relaciona, y puede ser con más de una cosa (el jefe que fue
-- también stakeholder del proyecto). De ahí una tabla de unión y no una columna.
--
-- Por qué no se reutiliza profile_items.parent_id: parent_id es JERARQUÍA (una
-- viñeta cuelga de un rol, uno a muchos) y borra en cascada hacia abajo. Esto es
-- una RELACIÓN muchos a muchos entre iguales. Meterlo en parent_id haría que la
-- referencia desapareciera al borrar el proyecto, cuando lo correcto es que se
-- quede en el master y pierda solo el vínculo.
--
-- ⚠ DATOS DE TERCEROS. Las filas de kind='reference' contienen datos de personas
--   que NO son el usuario. La RLS de profile_items ya las aísla por auth.uid(),
--   pero la regla de producto va más allá: no salen en ninguna vista pública, no
--   viajan en el resume.json exportado salvo petición explícita, y en el CV son
--   opt-in por variante y apagadas por defecto. Eso se cumple en el código, no
--   aquí; este comentario existe para que nadie lo relaje por accidente.
--
-- Requiere 0004 aplicado antes (el valor 'reference' del enum).
-- Idempotente: se puede re-ejecutar sin error.
-- ============================================================================

create table if not exists reference_links (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,  -- denormalizado, para RLS
  reference_id uuid not null references profile_items(id) on delete cascade,
  item_id      uuid not null references profile_items(id) on delete cascade,
  -- Cómo se conocieron, en palabras del usuario: jefe, cliente, profesor,
  -- stakeholder. Texto libre y no un enum a propósito: la relación laboral real
  -- no cabe en cinco valores, y un enum obligaría a migrar para añadir uno.
  relation     text,
  created_at   timestamptz not null default now(),
  unique (reference_id, item_id)
);

create index if not exists reference_links_reference_idx on reference_links (reference_id);
create index if not exists reference_links_item_idx      on reference_links (item_id);

-- ── Anti-IDOR ───────────────────────────────────────────────────────────────
-- Una FK NO pasa por RLS: sin esto, un usuario podría enlazar su referencia con
-- el profile_item de otro y descubrir que existe. Mismo patrón y misma razón que
-- check_variant_item_ownership (0001 §6). Además exige que reference_id sea de
-- verdad una referencia y item_id NO lo sea: sin esto se podrían encadenar
-- referencias entre sí, que no significa nada.
create or replace function check_reference_link_ownership() returns trigger as $$
declare owner uuid; k item_kind;
begin
  select user_id, kind into owner, k from profile_items where id = new.reference_id;
  if owner is null or owner <> new.user_id then
    raise exception 'reference_links.reference_id % no pertenece al usuario %', new.reference_id, new.user_id;
  end if;
  if k <> 'reference' then
    raise exception 'reference_links.reference_id % no es un item de tipo reference (es %)', new.reference_id, k;
  end if;

  select user_id, kind into owner, k from profile_items where id = new.item_id;
  if owner is null or owner <> new.user_id then
    raise exception 'reference_links.item_id % no pertenece al usuario %', new.item_id, new.user_id;
  end if;
  if k = 'reference' then
    raise exception 'una referencia no se enlaza con otra referencia';
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists reference_links_ownership on reference_links;
create trigger reference_links_ownership
  before insert or update on reference_links
  for each row execute function check_reference_link_ownership();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- La misma política "own rows" que las otras diez tablas (0001 §7).
alter table reference_links enable row level security;
drop policy if exists "own rows" on reference_links;
create policy "own rows" on reference_links
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
