-- ═══════════════════════════════════════════════════════════════════════════
-- MÓDULO CONDOMINIOS — Fase 1b (ADITIVO, idempotente)
-- Opciones por condominio y estado de deuda por unidad.
--
-- Cómo se lleva la deuda (regla aprobada: se recalcula SIEMPRE con la tarifa vigente):
--   meses de aseo pendientes = desde `aseo_pendiente_desde` hasta el mes actual
--   multa = mensualidad × 10%/12% × (meses − 1)  +  `multa_meses` (multas que quedaron
--           pendientes cuando el aseo ya se pagó, p. ej. condominio paga aseo y el dueño debe su multa)
--   `abono_bs` = pagos parciales todavía no aplicados a un mes completo
-- Los pagos quedan en condominio_movimientos (libro mayor) y en pagos_reportados.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.condominios add column if not exists permite_pago_por_unidad boolean not null default false;
alter table public.condominios add column if not exists permite_abonos          boolean not null default true;
alter table public.condominios add column if not exists cobro_tarifa_por_unidad boolean not null default false;

-- Estado del grupo "unidades declaradas no registradas" / tarifa fija (nivel condominio)
alter table public.condominios add column if not exists aseo_pendiente_desde date;
alter table public.condominios add column if not exists multa_meses integer not null default 0;
alter table public.condominios add column if not exists abono_bs numeric(16,2) not null default 0;

-- Estado por unidad
alter table public.condominio_unidades add column if not exists aseo_pendiente_desde date;
alter table public.condominio_unidades add column if not exists multa_meses integer not null default 0;
alter table public.condominio_unidades add column if not exists abono_bs numeric(16,2) not null default 0;

create index if not exists condominio_unidades_identidad_idx on public.condominio_unidades (identidad);
