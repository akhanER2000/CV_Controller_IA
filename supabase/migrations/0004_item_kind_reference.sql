-- ============================================================================
-- Corpus · 0004_item_kind_reference.sql
-- Añade el valor 'reference' al enum item_kind. Una referencia es un item del
-- master como cualquier otro: lleva procedencia, cuelga de un perfil, y respeta
-- la misma RLS. Por eso es un kind y no una tabla aparte.
--
-- ⚠ VA SOLO EN SU PROPIO FICHERO A PROPÓSITO. `alter type … add value` no puede
--   convivir con sentencias que USEN el valor nuevo dentro de la misma
--   transacción, y el editor SQL de Supabase envuelve cada ejecución en una. La
--   tabla de vínculos va en 0005 justo por eso. Ejecuta este fichero primero,
--   solo, y después el 0005.
--
-- ⚠ IRREVERSIBLE: Postgres no tiene `drop value`. Quitar 'reference' obligaría a
--   recrear el tipo entero migrando profile_items y staged_items con las dos
--   tablas bloqueadas. El nombre está pensado para no tener que hacerlo.
--
-- Idempotente (if not exists), así que re-ejecutarlo no da error.
-- ============================================================================

alter type item_kind add value if not exists 'reference';
