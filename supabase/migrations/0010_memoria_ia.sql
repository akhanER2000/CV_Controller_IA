-- 0010 · memoria de la IA por usuario (DA-M2)
--
-- IDEMPOTENTE: se puede correr las veces que haga falta.
--
-- La «memoria del perfil» es una serialización CANÓNICA y DETERMINISTA del master
-- (sin IA): campos clave, fechas y evidencia verificada recortada. Viaja en las
-- llamadas de redacción como primer bloque del system, cacheado en Anthropic
-- (prompt caching). `huella` = sha256 del contenido: si el master no cambió, la
-- huella tampoco, y la fila se reutiliza sin reescribirse.
--
-- `ultima_llamada` guarda los tokens de la última llamada de redacción (entrada,
-- salida, cacheados) para que el panel de salud diga si la caché está pagando.

create table if not exists ai_memoria (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  contenido      text not null default '',
  huella         text not null default '',
  items          int  not null default 0,
  tokens_aprox   int  not null default 0,
  actualizada_en timestamptz not null default now(),
  ultima_llamada jsonb
);

-- Si la tabla ya existía de una versión previa sin la columna.
alter table ai_memoria add column if not exists ultima_llamada jsonb;

alter table ai_memoria enable row level security;

-- Solo el dueño ve y escribe su memoria.
drop policy if exists "own memoria" on ai_memoria;
create policy "own memoria" on ai_memoria
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
