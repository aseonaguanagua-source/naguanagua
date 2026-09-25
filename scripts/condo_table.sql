CREATE TABLE IF NOT EXISTS condominios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT UNIQUE,
  identidad TEXT,
  nombre TEXT,
  direccion TEXT,
  unidades INTEGER DEFAULT 0,
  representante TEXT,
  estado TEXT DEFAULT 'Activo',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
