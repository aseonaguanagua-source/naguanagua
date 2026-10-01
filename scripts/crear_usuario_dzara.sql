-- ============================================================
-- Insertar usuario dzara con acceso a los 3 módulos:
-- Cajero/Admin, Presidencia y Operador de Censo
--
-- Rol "Administrador" cumple con:
--   ✅ Admin/Cajero (cualquier rol en trabajadores)
--   ✅ Presidencia (acepta 'Presidencia' O 'Administrador')
--   ✅ Operador de Censo (acepta cualquier rol activo en trabajadores)
--
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

INSERT INTO trabajadores (
  usuario,
  clave,
  nombre,
  rol,
  letra,
  estado
)
VALUES (
  'dzara',
  'dzara',
  'David Zara',
  'Administrador',
  'DZ',
  'Activo'
)
ON CONFLICT (usuario)
DO UPDATE SET
  clave   = 'dzara',
  nombre  = 'David Zara',
  rol     = 'Administrador',
  letra   = 'DZ',
  estado  = 'Activo';

-- Verificar que quedó correcto
SELECT id, usuario, nombre, rol, letra, estado
FROM trabajadores
WHERE usuario = 'dzara';
