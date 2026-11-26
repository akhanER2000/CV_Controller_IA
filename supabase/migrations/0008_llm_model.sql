-- ============================================================================
-- Corpus · 0008_llm_model.sql
-- El modelo que el usuario eligió en Ajustes (selector de modelos probados).
--
-- `src/lib/account/preferencias.ts` lee y escribe user_settings.llm_model desde el
-- bloque del selector, pero ninguna migración 0001-0007 la creaba: Ajustes decía
-- «falta la columna llm_model» y la extracción usaba siempre el modelo del registro.
-- Inventario hecho contra todo src/: es la ÚNICA columna que el código usa y las
-- migraciones no crean.
--
-- Valor: un id de modelo ([A-Za-z0-9._-], máx. 64; lo valida idModeloValido) de
-- Anthropic (claude-…) o de Gemini (gemini-…), o null = el modelo del registro.
-- Sin esta columna nada se rompe: se degrada al registro y Ajustes lo dice.
-- Aplicarla es a mano (la hace AKHAN).
--
-- Idempotente: se puede re-ejecutar sin error.
-- ============================================================================

alter table user_settings add column if not exists llm_model text;
