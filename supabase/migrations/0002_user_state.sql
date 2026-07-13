-- ============================================================================
-- Corpus · 0002_user_state.sql
-- Esquema SIMPLE para la app personal con login (correo + contraseña).
-- Cada usuario guarda TODO su estado (perfiles + CVs) en una fila jsonb.
-- Es lo mínimo para que funcione ya; el modelo completo (0001) queda para
-- cuando el producto crezca (variantes por tabla, ingesta con IA, etc.).
--
-- Aplicar en Supabase → SQL Editor → Run.
-- ============================================================================

create table if not exists user_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  state      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table user_state enable row level security;

-- Cada usuario solo ve y edita su propia fila.
drop policy if exists "own state" on user_state;
create policy "own state" on user_state
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
