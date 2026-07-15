-- ============================================================================
-- Corpus · 0003_avatars.sql
-- Perfil de cuenta: foto (avatar) y nombre visible. Todo esto es SOLO para la
-- UI de la app (el menú de usuario); NUNCA entra en el CV ni en el PDF.
--
-- Idempotente: se puede re-ejecutar sin error (add column if not exists,
-- on conflict do nothing, drop policy if exists antes de crearla).
-- Aplicar con el editor SQL de Supabase o la CLI.
-- ============================================================================

-- ── 1 · Columnas nuevas en user_settings ────────────────────────────────────
-- avatar_url guarda el PATH del objeto en Storage ({user_id}/avatar), no una
-- URL pública: el bucket es privado y la UI genera una signed URL al mostrarlo.
-- display_name es el nombre visible en el menú (no el que aparezca en el CV).
alter table user_settings add column if not exists avatar_url   text;
alter table user_settings add column if not exists display_name text;

-- ── 2 · Bucket privado 'avatars' ────────────────────────────────────────────
-- Mismo patrón que 'sources' (0001 §9): privado, path {user_id}/…, y la policy
-- compara el primer segmento del path contra auth.uid().
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

drop policy if exists "avatars own files" on storage.objects;
create policy "avatars own files" on storage.objects
  for all to authenticated
  using      (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
