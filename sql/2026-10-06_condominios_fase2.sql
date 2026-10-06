-- ═══════════════════════════════════════════════════════════════════════════
-- MÓDULO CONDOMINIOS — Fase 2 (ADITIVO, idempotente)
-- Jerarquía dentro del condominio: condominio → torre / sub-grupo → unidad (nietos de SIGYR)
-- y origen de cada condominio (migrado del sistema nuevo o rearmado desde SIGYR).
-- ═══════════════════════════════════════════════════════════════════════════

-- Unidad "padre" dentro del mismo condominio (torre, bloque, edificio). Null = cuelga directo del condominio.
alter table public.condominio_unidades add column if not exists padre_unidad_id uuid references public.condominio_unidades(id) on delete set null;
-- La unidad agrupa a otras (torre / sub-grupo)
alter table public.condominio_unidades add column if not exists es_grupo boolean not null default false;
create index if not exists condominio_unidades_padre_idx on public.condominio_unidades (padre_unidad_id);

-- Origen del condominio: 'MIGRACION' (sistema nuevo) | 'SIGYR_REARMADO' (el registro padre estaba eliminado; se rearmó con sus unidades activas) | 'SIGYR_NUEVO'
alter table public.condominios add column if not exists origen text not null default 'MIGRACION';
