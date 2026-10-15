-- Tabla que usa el módulo Convenios de Pago y Caja (no existe en la base actual).
-- Ejecutar una sola vez en Supabase > SQL Editor.
create table if not exists public.convenios (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  contribuyente text,
  identidad text,
  inmueble text,
  monto_total text,
  cuotas integer,
  frecuencia text,
  inicio date,
  estado text default 'Al Día',
  documento_url text,
  detalle_cuotas text,
  created_at timestamptz default now()
);
create index if not exists convenios_identidad_idx on public.convenios (identidad);
alter table public.convenios enable row level security;
create policy "convenios_all_authenticated" on public.convenios for all using (true) with check (true);
alter publication supabase_realtime add table public.convenios;
