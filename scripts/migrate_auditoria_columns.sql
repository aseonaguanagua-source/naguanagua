-- ============================================================
-- MIGRACIÓN COMPLETA: Crear tabla auditoria desde cero
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- 1. Crear la tabla auditoria con todas las columnas correctas
CREATE TABLE IF NOT EXISTS auditoria (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario     TEXT,
  accion      TEXT,
  categoria   TEXT DEFAULT 'SISTEMA',
  modulo      TEXT DEFAULT '',
  detalles    JSONB,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Índices para acelerar búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_auditoria_categoria   ON auditoria (categoria);
CREATE INDEX IF NOT EXISTS idx_auditoria_usuario     ON auditoria (usuario);
CREATE INDEX IF NOT EXISTS idx_auditoria_created_at  ON auditoria (created_at DESC);

-- 3. Verificar que se creó correctamente
SELECT 
  column_name, 
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'auditoria'
ORDER BY ordinal_position;
