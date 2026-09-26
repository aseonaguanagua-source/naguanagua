-- =============================================
-- EJECUTAR EN: Supabase Dashboard > SQL Editor
-- =============================================

CREATE TABLE IF NOT EXISTS public.retenciones_iva (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  identidad TEXT NOT NULL,
  contribuyente TEXT,
  codigo_inmueble TEXT,
  numero_planilla TEXT,
  periodo TEXT,
  fecha_planilla DATE,
  monto_base NUMERIC(14,2),
  monto_iva NUMERIC(14,2),
  monto_retenido NUMERIC(14,2),
  codigo_retencion TEXT,
  planilla_url TEXT,
  estado TEXT DEFAULT 'Pendiente',
  motivo_rechazo TEXT,
  aprobado_por TEXT,
  aprobado_at TIMESTAMPTZ,
  factura_url TEXT,
  factura_control TEXT,
  factura_emitida BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_ret_identidad ON public.retenciones_iva(identidad);
CREATE INDEX IF NOT EXISTS idx_ret_estado ON public.retenciones_iva(estado);

-- Storage bucket para PDFs (si no existe)
INSERT INTO storage.buckets (id, name, public)
VALUES ('retenciones', 'retenciones', false)
ON CONFLICT DO NOTHING;

-- Política para que solo usuarios autenticados puedan subir
CREATE POLICY IF NOT EXISTS "Subir planillas" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'retenciones');

CREATE POLICY IF NOT EXISTS "Ver planillas propias" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'retenciones');

-- RLS en retenciones_iva (opcional, permite todo desde service_role)
ALTER TABLE public.retenciones_iva ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Lectura admin" ON public.retenciones_iva
  FOR ALL USING (true);
