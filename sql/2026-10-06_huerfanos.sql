-- ════════════════════════════════════════════════════════════════
-- HUÉRFANOS: inmuebles que existen en SIGYR y no en el sistema nuevo
-- (sin condominio, o cuyo condominio padre no está en el módulo).
-- Desde la pestaña "Huérfanos" se pueden agregar a un condominio
-- o registrar como contribuyente normal.
-- ════════════════════════════════════════════════════════════════
create table if not exists public.huerfanos (
  id uuid primary key default gen_random_uuid(),
  inmueble text not null unique,                 -- código (URB / AURI)
  identidad text,                                -- cédula/RIF (null si SIGYR no la tiene)
  nombre text,
  correo text,
  telefono text,
  actividad text,
  tipo text,                                     -- Residencial / Comercial (SIGYR)
  direccion text,
  numero text,
  meses_deuda integer not null default 0,
  deuda_mmv numeric not null default 0,
  deuda_bs_sigyr numeric not null default 0,
  multa_bs_sigyr numeric not null default 0,
  padre_sugerido text,                           -- condominio padre según SIGYR
  motivo text,
  sigyr_property_id integer,
  creado_sigyr timestamptz,
  estado text not null default 'Pendiente',      -- Pendiente | Asignado a condominio | Registrado como contribuyente | Descartado
  resuelto_por text,
  resuelto_en timestamptz,
  resolucion jsonb,
  created_at timestamptz not null default now()
);
create index if not exists huerfanos_estado_idx on public.huerfanos (estado);
create index if not exists huerfanos_padre_idx on public.huerfanos (padre_sugerido);
alter table public.huerfanos enable row level security;
-- Solo el servidor (service role) lee y escribe; no hay acceso público.
