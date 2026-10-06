-- ============================================================================
-- 2026-10-06 · Tabla `documentos` (Notas de Crédito / saldo a favor)
-- Caja y Conciliación ya escriben aquí, pero la tabla no existía y esos
-- registros se perdían sin aviso. Ejecutar UNA vez en Supabase → SQL Editor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.documentos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  identidad     TEXT NOT NULL,
  contribuyente TEXT,
  tipo          TEXT NOT NULL,              -- 'Nota de Credito', ...
  estado        TEXT NOT NULL DEFAULT 'Vigente',
  detalles      JSONB DEFAULT '{}'::jsonb,  -- { monto, origen_referencia, fecha_emision, analista }
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS documentos_identidad_idx ON public.documentos (identidad);
CREATE INDEX IF NOT EXISTS documentos_tipo_idx      ON public.documentos (tipo, created_at DESC);

-- Mismo nivel de acceso que el resto de tablas operativas (Caja escribe desde el navegador).
-- Sin DELETE para la clave pública: una nota de crédito no se borra, se anula (estado).
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS documentos_select ON public.documentos;
DROP POLICY IF EXISTS documentos_insert ON public.documentos;
DROP POLICY IF EXISTS documentos_update ON public.documentos;

CREATE POLICY documentos_select ON public.documentos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY documentos_insert ON public.documentos FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY documentos_update ON public.documentos FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

-- Refrescar el caché de la API para que la tabla sea visible de inmediato
NOTIFY pgrst, 'reload schema';
