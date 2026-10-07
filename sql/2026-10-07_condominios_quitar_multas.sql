-- ═══════════════════════════════════════════════════════════════════════════
-- MÓDULO CONDOMINIOS — Quitar multas (ADITIVO, idempotente). Ejecutar en el editor SQL de Supabase.
-- Los meses pendientes hasta esta fecha NO llevan multa (exoneración hecha por un administrador).
-- No borra ni modifica datos existentes.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.condominio_unidades add column if not exists multa_exonerada_hasta date;
alter table public.condominios         add column if not exists multa_exonerada_hasta date;
