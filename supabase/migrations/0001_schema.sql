-- ============================================================================
-- Corpus · 0001_schema.sql
-- El modelo de datos central (prompt 02 §2). En orden de dependencias.
--
-- La decisión arquitectónica clave: variant_items es una TABLA DE UNIÓN CON
-- OVERRIDES. La variante REFERENCIA items del master y opcionalmente los
-- sobreescribe campo por campo. NO copia datos. Eso resuelve la deriva que
-- ProfileStack/Teal/Rezi dejan sin resolver y habilita "N de M variantes
-- desactualizadas".
--
-- Requiere un proyecto Supabase. Aplicar con la CLI de Supabase o el editor SQL.
-- ============================================================================

create extension if not exists pgcrypto;

-- ── Enums ───────────────────────────────────────────────────────────────────
-- 'paste' y 'github' son fuentes de primera clase (02 §3.1); 'api' es un origen
-- de item (dato duro de la API de GitHub, aceptado por el usuario) (02 §2).
create type source_kind      as enum ('paste','pdf','docx','image','url','github','manual');
create type ingestion_status as enum ('pending','parsing','extracted','failed','reviewed');
create type item_kind        as enum
  ('basics','summary','work','education','project','skill',
   'certification','language','publication','link','bullet');
create type item_origin      as enum ('extracted','manual','ai_rephrased','ai_translated','api');
create type staged_status    as enum ('pending','accepted','rejected','merged');

-- ── 1 · Fuentes y procedencia ───────────────────────────────────────────────
create table ingestion_batches (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table ingestion_sources (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  batch_id      uuid references ingestion_batches(id) on delete cascade,
  kind          source_kind not null,
  original_name text,
  storage_path  text,
  source_url    text,
  status        ingestion_status not null default 'pending',
  page_count    int,
  -- raw_text es OBLIGATORIO para toda fuente, incluidas imágenes: para
  -- imágenes/PDF escaneado es la TRANSCRIPCIÓN VERBATIM previa a extraer nada.
  -- Sin raw_text no hay verificación de evidencia posible (02 §4.4).
  raw_text      text,
  raw_text_is_transcription boolean not null default false,
  error         text,
  created_at    timestamptz not null default now()
);

-- Progreso específico y verdadero (02 §4.2). NUNCA un porcentaje inventado.
create table ingestion_events (
  id         bigserial primary key,
  source_id  uuid not null references ingestion_sources(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  message    text not null,   -- clave de i18n, no texto hardcodeado
  payload    jsonb,           -- { page: 2, total: 3 } | { found: 4, kind: 'work' }
  created_at timestamptz not null default now()
);

-- ── 2 · El master ───────────────────────────────────────────────────────────
create table master_profiles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null default 'Mi carrera',
  updated_at timestamptz not null default now(),
  unique (user_id)   -- UN registro canónico por usuario. Es la tesis del producto.
);

create table profile_items (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references master_profiles(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,  -- denormalizado, para RLS
  kind        item_kind not null,
  parent_id   uuid references profile_items(id) on delete cascade,        -- un 'bullet' cuelga de un 'work'
  data        jsonb not null,       -- forma según kind; validado con Zod en el borde
  lang        text not null default 'es',
  tags        text[] not null default '{}',
  -- ★★ PROCEDENCIA. Esto es el producto. NADA se salta esto — ni 'basics'. ★★
  origin            item_origin not null default 'manual',
  source_id         uuid references ingestion_sources(id) on delete set null,
  evidence_snippet  text,          -- el fragmento LITERAL del origen. Se muestra en la UI.
  evidence_page     int,
  evidence_verified boolean not null default false,   -- ¿el snippet aparece literal en raw_text?
  rephrased_from    uuid references profile_items(id) on delete set null,
  translated_from   uuid references profile_items(id) on delete set null, -- paridad ES/EN
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on profile_items (profile_id, kind);
create index on profile_items (parent_id);
create index on profile_items (translated_from);

-- ── 3 · Staging — nada entra al master sin que el usuario lo acepte ──────────
create table staged_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  source_id    uuid not null references ingestion_sources(id) on delete cascade,
  kind         item_kind not null,
  parent_staged_id uuid references staged_items(id) on delete cascade,   -- viñeta → su rol
  data         jsonb not null,
  lang         text not null default 'es',
  evidence_snippet  text,
  evidence_page     int,
  evidence_verified boolean not null default false,
  status       staged_status not null default 'pending',
  duplicate_of uuid references profile_items(id) on delete set null,
  merge_proposal jsonb,           -- fusión propuesta campo por campo. La decide el USUARIO.
  promoted_to  uuid references profile_items(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ── 4 · Ofertas y variantes ─────────────────────────────────────────────────
create table job_descriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text,
  company    text,
  source_url text,
  raw_text   text not null,
  jsonld     jsonb,       -- schema.org/JobPosting si venía embebido
  keywords   jsonb,       -- [{term, kind:'hard'|'soft'}]
  created_at timestamptz not null default now()
);

create table cv_variants (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  profile_id   uuid not null references master_profiles(id) on delete cascade,
  name         text not null,
  target_title text,        -- ★ el job title objetivo (10,6x). SE IMPRIME EN EL PDF.
  lang         text not null default 'es',
  template     text not null default 'ats-default',
  job_id       uuid references job_descriptions(id) on delete set null,
  archived     boolean not null default false,
  master_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ★★★ LA TABLA CLAVE ★★★
create table variant_items (
  id         uuid primary key default gen_random_uuid(),
  variant_id uuid not null references cv_variants(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- ON DELETE RESTRICT, no CASCADE: borrar un item del master NO puede destruir
  -- en silencio el override que el usuario escribió. Se le avisa y él decide.
  item_id    uuid not null references profile_items(id) on delete restrict,
  visible    boolean not null default true,
  sort_order int not null default 0,
  -- ★ OVERRIDE POR CAMPO. null/'{}' ⇒ hereda del master y se actualiza solo.
  override_data jsonb,
  -- ★ PROCEDENCIA DEL OVERRIDE: es lo que se IMPRIME en el PDF.
  override_origin item_origin,
  override_source_item uuid references profile_items(id) on delete set null,
  override_reason text,
  override_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (variant_id, item_id)
);
create index on variant_items (variant_id, sort_order);

-- ── 5 · Ajustes de usuario ──────────────────────────────────────────────────
create table user_settings (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  ui_lang     text not null default 'es',
  theme       text not null default 'dark',        -- dark (grafito) | light (porcelana)
  ai_enabled  boolean not null default true,       -- el toggle global de IA (02 §2)
  llm_api_key text,                                 -- BYOK. CIFRADO. Nunca al cliente.
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── 6 · Triggers y sincronización ───────────────────────────────────────────
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at := now(); return new; end;
$$ language plpgsql;

create trigger t_touch_master   before update on master_profiles for each row execute function touch_updated_at();
create trigger t_touch_pitem    before update on profile_items   for each row execute function touch_updated_at();
create trigger t_touch_variant  before update on cv_variants     for each row execute function touch_updated_at();
create trigger t_touch_vitem    before update on variant_items   for each row execute function touch_updated_at();
create trigger t_touch_settings before update on user_settings   for each row execute function touch_updated_at();

-- Tocar el master cuando cambia CUALQUIER item suyo (para "desactualizada").
create or replace function touch_master() returns trigger as $$
begin
  update master_profiles set updated_at = now()
   where id = coalesce(new.profile_id, old.profile_id);
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger t_master_from_item
  after insert or update or delete on profile_items
  for each row execute function touch_master();

-- ★ Anti-IDOR: un FK NO pasa por RLS. Sin esto, el usuario A podría referenciar
--   un profile_item del usuario B en su variant_items. (02 §2.7)
create or replace function check_variant_item_ownership() returns trigger as $$
declare owner uuid;
begin
  select user_id into owner from profile_items where id = new.item_id;
  if owner is null or owner <> new.user_id then
    raise exception 'variant_items.item_id % no pertenece al usuario %', new.item_id, new.user_id;
  end if;
  if new.override_source_item is not null then
    select user_id into owner from profile_items where id = new.override_source_item;
    if owner is null or owner <> new.user_id then
      raise exception 'override_source_item no pertenece al usuario';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger t_variant_item_ownership
  before insert or update on variant_items
  for each row execute function check_variant_item_ownership();

-- ── 7 · RLS — obligatorio en todas las tablas ───────────────────────────────
-- user_id está denormalizado a propósito en cada tabla para evitar joins en las
-- políticas. La política "own rows" es idéntica en todas. Idempotente: se puede
-- re-ejecutar sin error (drop policy if exists antes de create).
do $$
declare t text;
begin
  foreach t in array array[
    'ingestion_batches','ingestion_sources','ingestion_events',
    'master_profiles','profile_items','staged_items',
    'job_descriptions','cv_variants','variant_items','user_settings'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "own rows" on %I;', t);
    execute format(
      'create policy "own rows" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid());',
      t
    );
  end loop;
end $$;

-- ── 8 · Alta de usuario: cada registro nace con su master + ajustes ──────────
-- Un master_profiles por usuario (unique user_id) ES la tesis. Se crea en el
-- alta para que la app nunca tenga que "crear el master si no existe".
create or replace function handle_new_user()
returns trigger security definer set search_path = public as $$
begin
  insert into master_profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into user_settings   (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── 9 · Storage — bucket privado 'sources' ──────────────────────────────────
-- Path {user_id}/{source_id}/{filename}. Los archivos NUNCA pasan por una Route
-- Handler (límite 4,5 MB de Vercel → 413): subida directa a Storage con URL
-- firmada de expiración corta (02 §1, §4.1). La policy compara el primer
-- segmento del path contra auth.uid().
insert into storage.buckets (id, name, public)
values ('sources', 'sources', false)
on conflict (id) do nothing;

drop policy if exists "sources own files" on storage.objects;
create policy "sources own files" on storage.objects
  for all to authenticated
  using (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'sources' and (storage.foldername(name))[1] = auth.uid()::text);
