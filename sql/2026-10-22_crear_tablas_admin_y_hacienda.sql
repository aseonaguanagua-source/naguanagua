-- ====================================================================
-- MIGRACIÓN DE TABLAS DE ADMINISTRACIÓN INTERNA Y HACIENDA MUNICIPAL
-- ====================================================================

-- 1. Partidas Presupuestarias
CREATE TABLE IF NOT EXISTS public.admin_partidas_presupuestarias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_partida TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  monto_asignado NUMERIC DEFAULT 0,
  monto_comprometido NUMERIC DEFAULT 0,
  monto_causado NUMERIC DEFAULT 0,
  monto_pagado NUMERIC DEFAULT 0,
  disponible NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Órdenes de Compras y Servicios
CREATE TABLE IF NOT EXISTS public.admin_compras_ordenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_orden TEXT,
  proveedor TEXT,
  rif TEXT,
  concepto TEXT,
  partida_id UUID REFERENCES public.admin_partidas_presupuestarias(id) ON DELETE SET NULL,
  monto_total NUMERIC DEFAULT 0,
  estatus TEXT DEFAULT 'Borrador',
  fecha DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Cuentas Financieras
CREATE TABLE IF NOT EXISTS public.admin_finanzas_cuentas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  banco TEXT NOT NULL,
  numero_cuenta TEXT NOT NULL,
  tipo_cuenta TEXT,
  titular TEXT,
  saldo_actual NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Movimientos Financieros
CREATE TABLE IF NOT EXISTS public.admin_finanzas_movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id UUID REFERENCES public.admin_finanzas_cuentas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  monto NUMERIC NOT NULL,
  referencia TEXT,
  concepto TEXT,
  conciliado BOOLEAN DEFAULT false,
  fecha DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Empleados de RRHH
CREATE TABLE IF NOT EXISTS public.admin_rrhh_empleados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cedula TEXT NOT NULL,
  nombres TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  cargo TEXT,
  departamento TEXT,
  sueldo_base NUMERIC DEFAULT 0,
  fecha_ingreso DATE,
  estatus TEXT DEFAULT 'Activo',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Nómina
CREATE TABLE IF NOT EXISTS public.admin_nomina (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID REFERENCES public.admin_rrhh_empleados(id) ON DELETE CASCADE,
  periodo TEXT NOT NULL,
  monto_neto NUMERIC DEFAULT 0,
  asignaciones NUMERIC DEFAULT 0,
  deducciones NUMERIC DEFAULT 0,
  estado TEXT DEFAULT 'Calculada',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Almacén e Insumos
CREATE TABLE IF NOT EXISTS public.admin_almacen_insumos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT,
  nombre TEXT NOT NULL,
  categoria TEXT,
  cantidad_disponible NUMERIC DEFAULT 0,
  unidad_medida TEXT,
  punto_reorden NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Bienes Nacionales
CREATE TABLE IF NOT EXISTS public.admin_bienes_nacionales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_bien TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  serial TEXT,
  ubicacion TEXT,
  responsable TEXT,
  estado_fisico TEXT DEFAULT 'Operativo',
  valor_adquisicion NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. POA (Plan Operativo Anual)
CREATE TABLE IF NOT EXISTS public.admin_poa_proyectos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_proyecto TEXT NOT NULL,
  objetivo TEXT,
  departamento TEXT,
  monto_estimado NUMERIC DEFAULT 0,
  porcentaje_avance NUMERIC DEFAULT 0,
  estatus TEXT DEFAULT 'En Planificación',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. Hacienda: Catastro, Empresas, Licencias, Multas, Pagos, Vehículos, Declaraciones
CREATE TABLE IF NOT EXISTS public.hacienda_catastro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_catastral TEXT UNIQUE,
  propietario TEXT,
  rif TEXT,
  direccion TEXT,
  avaluo NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.hacienda_empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rif TEXT UNIQUE,
  razon_social TEXT,
  ramo TEXT,
  direccion TEXT,
  telefono TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.hacienda_licencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_licencia TEXT UNIQUE,
  empresa_id UUID,
  actividad TEXT,
  vencimiento DATE,
  estado TEXT DEFAULT 'Vigente',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.hacienda_declaraciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rif TEXT,
  periodo TEXT,
  ingresos_brutos NUMERIC DEFAULT 0,
  impuesto_determinado NUMERIC DEFAULT 0,
  estado TEXT DEFAULT 'Presentada',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.hacienda_pagos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referencia TEXT,
  rif TEXT,
  concepto TEXT,
  monto NUMERIC DEFAULT 0,
  fecha DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.hacienda_vehiculos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placa TEXT UNIQUE,
  propietario TEXT,
  rif TEXT,
  marca TEXT,
  modelo TEXT,
  ano INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. Seguridad: Habilitar Row Level Security (RLS) en todas las tablas de Administración y Hacienda
ALTER TABLE public.admin_partidas_presupuestarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_compras_ordenes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_finanzas_cuentas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_finanzas_movimientos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_rrhh_empleados           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_nomina                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_almacen_insumos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_bienes_nacionales        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_poa_proyectos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hacienda_catastro              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hacienda_empresas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hacienda_licencias             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hacienda_declaraciones         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hacienda_pagos                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hacienda_vehiculos             ENABLE ROW LEVEL SECURITY;

-- 12. Índices de búsqueda frecuente para Hacienda y RRHH
CREATE INDEX IF NOT EXISTS idx_rrhh_cedula          ON public.admin_rrhh_empleados (cedula);
CREATE INDEX IF NOT EXISTS idx_nomina_empleado_per  ON public.admin_nomina (empleado_id, periodo);
CREATE INDEX IF NOT EXISTS idx_fin_mov_cuenta_fecha ON public.admin_finanzas_movimientos (cuenta_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_hac_decl_rif_periodo ON public.hacienda_declaraciones (rif, periodo);
CREATE INDEX IF NOT EXISTS idx_hac_pagos_rif_fecha  ON public.hacienda_pagos (rif, fecha DESC);
