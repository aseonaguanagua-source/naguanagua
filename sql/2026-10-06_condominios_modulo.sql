-- ═══════════════════════════════════════════════════════════════════════════
-- MÓDULO CONDOMINIOS — Fase 1 (tablas nuevas, ADITIVO: no modifica nada existente)
-- Ejecutar en Supabase → SQL Editor. Idempotente (se puede correr más de una vez).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Ficha del condominio
create table if not exists public.condominios (
  id               uuid primary key default gen_random_uuid(),
  codigo           text not null unique,                 -- código del inmueble padre (URB…)
  identidad        text not null,                        -- RIF del condominio / junta
  nombre           text not null,
  tipo             text not null check (tipo in ('RESIDENCIAL','COMERCIAL','MIXTO')),
  modalidad        text not null default 'CENTRALIZADO'
                   check (modalidad in ('CENTRALIZADO','MIXTO_COMERCIAL','INDIVIDUAL','TARIFA_FIJA')),
  cant_declarada   integer not null default 1 check (cant_declarada >= 1),
  actividad        text,
  tarifa_mmv       numeric(10,4),                        -- F.O. por unidad
  tarifa_fija_bs   numeric(14,2),                        -- solo modalidad TARIFA_FIJA
  agente_retencion boolean not null default false,
  administradora   text,
  telefono         text,
  correo           text,
  direccion        text,
  estado           text not null default 'Activo' check (estado in ('Activo','Inactivo')),
  notas            text,
  migrado_desde    jsonb,                                -- foto del inmueble original al migrar
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists condominios_identidad_idx on public.condominios (identidad);

-- 2. Unidades (aptos / locales)
create table if not exists public.condominio_unidades (
  id             uuid primary key default gen_random_uuid(),
  condominio_id  uuid not null references public.condominios(id) on delete cascade,
  inmueble       text,                                   -- código del inmueble de la unidad (si existe)
  numero         text,                                   -- apto / local / oficina
  identidad      text,                                   -- dueño
  propietario    text,
  actividad      text,
  tarifa_mmv     numeric(10,4),
  estado         text not null default 'Activa' check (estado in ('Activa','Desocupada','Eliminada')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists condominio_unidades_condo_idx on public.condominio_unidades (condominio_id);
create unique index if not exists condominio_unidades_inmueble_uq on public.condominio_unidades (inmueble) where inmueble is not null;

-- 3. Libro mayor (la deuda = suma de movimientos)
create table if not exists public.condominio_movimientos (
  id             uuid primary key default gen_random_uuid(),
  condominio_id  uuid not null references public.condominios(id) on delete cascade,
  unidad_id      uuid references public.condominio_unidades(id) on delete set null,
  tipo           text not null check (tipo in ('SALDO_INICIAL','CARGO','MULTA','IVA','PAGO','ABONO','RETENCION','AJUSTE','NOTA_CREDITO')),
  periodo        date,                                   -- primer día del mes al que corresponde
  concepto       text,
  monto_bs       numeric(16,2) not null,                 -- + aumenta deuda, − la reduce
  monto_mmv      numeric(14,6),
  tasa_bcv       numeric(14,6),
  pago_id        uuid,                                   -- pagos_reportados.id
  usuario        text,
  created_at     timestamptz not null default now()
);
create index if not exists condominio_mov_condo_idx on public.condominio_movimientos (condominio_id, periodo);
create index if not exists condominio_mov_pago_idx on public.condominio_movimientos (pago_id);

-- 4. Pagos: se siguen guardando en pagos_reportados, marcados por módulo
alter table public.pagos_reportados add column if not exists modulo text default 'contribuyentes';

-- 5. Seguridad: solo el servidor (service_role) lee y escribe estas tablas
alter table public.condominios            enable row level security;
alter table public.condominio_unidades    enable row level security;
alter table public.condominio_movimientos enable row level security;

-- 6. updated_at automático
create or replace function public.tg_set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists condominios_updated on public.condominios;
create trigger condominios_updated before update on public.condominios for each row execute function public.tg_set_updated_at();
drop trigger if exists condominio_unidades_updated on public.condominio_unidades;
create trigger condominio_unidades_updated before update on public.condominio_unidades for each row execute function public.tg_set_updated_at();
