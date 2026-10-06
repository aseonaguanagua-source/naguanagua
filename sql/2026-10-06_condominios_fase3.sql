-- ═══════════════════════════════════════════════════════════════════════════
-- MÓDULO CONDOMINIOS — Fase 3 (ADITIVO, idempotente). Ejecutar en el editor SQL de Supabase.
--  · Multas por contribuyente (agregar / anular a mano; las paga cada contribuyente).
--  · Meses de deuda agregados a mano (al condominio o a una unidad).
--  · Pagos repartidos (un pago bancario → una factura por local cuando se paga por separado).
-- No borra ni modifica datos existentes.
-- ═══════════════════════════════════════════════════════════════════════════

-- Multas manuales de un contribuyente (unidad) o del condominio
create table if not exists public.condominio_multas (
  id             uuid primary key default gen_random_uuid(),
  condominio_id  uuid not null references public.condominios(id) on delete cascade,
  unidad_id      uuid references public.condominio_unidades(id) on delete set null,
  identidad      text,
  concepto       text not null,
  monto_bs       numeric(16,2),            -- monto fijo en Bs (o null si es por MMV)
  monto_mmv      numeric(14,6),            -- monto en MMV (se convierte con la tasa vigente)
  periodo        date,
  estado         text not null default 'Pendiente' check (estado in ('Pendiente','Pagada','Anulada')),
  pago_id        uuid,
  creada_por     text,
  anulada_por    text,
  motivo_anulacion text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists condominio_multas_unidad_idx on public.condominio_multas (unidad_id, estado);
create index if not exists condominio_multas_condo_idx  on public.condominio_multas (condominio_id, estado);
create index if not exists condominio_multas_ident_idx  on public.condominio_multas (identidad);
alter table public.condominio_multas enable row level security;
drop trigger if exists condominio_multas_updated on public.condominio_multas;
create trigger condominio_multas_updated before update on public.condominio_multas for each row execute function public.tg_set_updated_at();

-- Unidades creadas a mano en el módulo (contribuyente nuevo o actividad nueva de un local)
alter table public.condominio_unidades add column if not exists creada_en_modulo boolean not null default false;

-- Pago repartido: varias filas (una por local/contribuyente) del mismo movimiento bancario
alter table public.pagos_reportados add column if not exists grupo_pago uuid;
create index if not exists pagos_reportados_grupo_idx on public.pagos_reportados (grupo_pago);
create index if not exists pagos_reportados_modulo_idx on public.pagos_reportados (modulo);
