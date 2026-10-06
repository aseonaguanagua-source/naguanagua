-- ============================================================================
-- 2026-10-06 · Tabla `certificados` (Solvencias municipales)
-- El sistema (generar solvencia, AppContext, página /validar del QR) usa esta
-- tabla, pero nunca fue creada: las solvencias no quedaban registradas y la
-- validación por QR siempre decía "no encontrado".
-- Ejecutar UNA vez en Supabase → SQL Editor.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.certificados (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo        TEXT NOT NULL UNIQUE,
  contribuyente TEXT,
  identidad     TEXT NOT NULL,
  inmueble      TEXT,
  tipo          TEXT NOT NULL DEFAULT 'Solvencia Municipal',
  emision       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  vencimiento   TIMESTAMPTZ NOT NULL,
  estado        TEXT NOT NULL DEFAULT 'Vigente',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS certificados_identidad_idx ON public.certificados (identidad);

-- Lectura pública (validación por QR) y emisión desde el panel. Sin DELETE: se anula por estado.
ALTER TABLE public.certificados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS certificados_select ON public.certificados;
DROP POLICY IF EXISTS certificados_insert ON public.certificados;
DROP POLICY IF EXISTS certificados_update ON public.certificados;

CREATE POLICY certificados_select ON public.certificados FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY certificados_insert ON public.certificados FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY certificados_update ON public.certificados FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
