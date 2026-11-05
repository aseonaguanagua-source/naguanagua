-- =============================================================================
-- REPARACIÓN INTEGRAL DE POLÍTICAS RLS (ROW LEVEL SECURITY) - NAGUANAGUA
-- Ejecutar en el SQL Editor de Supabase para habilitar acceso a la App Móvil
-- (Soy Contribuyente) y consultas PostgREST directas.
-- =============================================================================

DO $$
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'facturas',
        'condominios',
        'condominio_unidades',
        'condominio_movimientos',
        'condominio_multas',
        'servicios_especiales',
        'sistema_config',
        'convenios_pago',
        'convenios_cuotas',
        'documentos',
        'certificados',
        'retenciones_iva',
        'auditoria',
        'admin_proveedores',
        'admin_ordenes',
        'admin_pagos_proveedores',
        'admin_nomina_empleados',
        'admin_nomina_corridas',
        'admin_bienes',
        'admin_almacen_items',
        'admin_almacen_movimientos',
        'admin_caja_chica_fondos',
        'admin_caja_chica_gastos',
        'admin_contratos',
        'admin_viaticos',
        'hacienda_presupuesto_partidas',
        'hacienda_presupuesto_reformas',
        'hacienda_bancos_cuentas',
        'hacienda_bancos_movimientos',
        'hacienda_retenciones',
        'hacienda_asientos',
        'hacienda_tasas',
        'hacienda_exoneraciones'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = tbl
        ) THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
            EXECUTE format('DROP POLICY IF EXISTS "Permitir acceso global %s" ON public.%I;', tbl, tbl);
            EXECUTE format(
                'CREATE POLICY "Permitir acceso global %s" ON public.%I FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);',
                tbl, tbl
            );
        END IF;
    END LOOP;
END $$;

