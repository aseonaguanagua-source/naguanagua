-- ============================================================================
-- EMERGENCIA 2026-10-06: liberar la base de datos saturada
-- Ejecutar en Supabase → SQL Editor (botón "Run").
-- ============================================================================

-- 1) Ver qué está ocupando la base de datos (opcional, solo para mirar)
SELECT pid, usename, state, now() - query_start AS duracion, left(query, 120) AS consulta
FROM pg_stat_activity
WHERE state <> 'idle' AND pid <> pg_backend_pid()
ORDER BY query_start;

-- 2) Cancelar las consultas de la app que llevan más de 15 segundos
--    (solo las de la página web: anon / authenticated / authenticator; NO toca procesos internos de Supabase)
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'active'
  AND pid <> pg_backend_pid()
  AND usename IN ('anon', 'authenticated', 'authenticator', 'service_role')
  AND now() - query_start > interval '15 seconds';
