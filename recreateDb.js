const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { Client } = require('pg');

const connectionString = 'postgresql://postgres:4tpBZz4%21H%3FZGuNh@db.tlhbsykmpmiaqxbhjewb.supabase.co:5432/postgres';

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

const ddl = `
  DROP TABLE IF EXISTS audit_logs CASCADE;
  DROP TABLE IF EXISTS sistema_config CASCADE;
  DROP TABLE IF EXISTS hacienda_multas CASCADE;
  DROP TABLE IF EXISTS servicios_especiales CASCADE;
  DROP TABLE IF EXISTS pagos_reportados CASCADE;
  DROP TABLE IF EXISTS convenios_cuotas CASCADE;
  DROP TABLE IF EXISTS convenios_pago CASCADE;
  DROP TABLE IF EXISTS facturas CASCADE;
  DROP TABLE IF EXISTS inmuebles CASCADE;
  DROP TABLE IF EXISTS contribuyentes CASCADE;

  CREATE TABLE contribuyentes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identidad TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    email TEXT,
    telefono TEXT,
    direccion TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE TABLE inmuebles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inmueble TEXT UNIQUE,
    identidad TEXT REFERENCES contribuyentes(identidad) ON DELETE CASCADE,
    tipo TEXT,
    actividad_principal TEXT,
    direccion TEXT,
    estado TEXT DEFAULT 'Activo',
    cant_inmuebles NUMERIC DEFAULT 1,
    mmv_mes NUMERIC DEFAULT 0,
    saldo_favor_bs NUMERIC DEFAULT 0,
    deuda_mmv NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE TABLE facturas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referencia TEXT UNIQUE NOT NULL,
    identidad TEXT,
    contribuyente TEXT,
    emision DATE,
    vencimiento DATE,
    monto NUMERIC,
    estado TEXT DEFAULT 'Pendiente',
    fecha_pago DATE,
    metodo_pago TEXT,
    referencia_pago TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE TABLE convenios_pago (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero TEXT UNIQUE NOT NULL,
    identidad TEXT,
    monto_total NUMERIC,
    inicial NUMERIC,
    cuotas INTEGER,
    estado TEXT DEFAULT 'Activo',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE TABLE convenios_cuotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    convenio_id UUID REFERENCES convenios_pago(id) ON DELETE CASCADE,
    fecha DATE,
    monto NUMERIC,
    estado TEXT DEFAULT 'Pendiente',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE TABLE pagos_reportados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identidad TEXT,
    monto NUMERIC,
    banco TEXT,
    referencia TEXT UNIQUE NOT NULL,
    tipo TEXT,
    estado TEXT DEFAULT 'Por Verificar',
    detalles JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE TABLE servicios_especiales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo TEXT,
    identidad TEXT,
    contribuyente TEXT,
    descripcion TEXT,
    monto NUMERIC,
    fecha DATE,
    estado TEXT DEFAULT 'Pendiente',
    referencia TEXT UNIQUE,
    notas TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE TABLE hacienda_multas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identidad_infractor TEXT,
    nombre_infractor TEXT,
    tipo_multa TEXT,
    monto NUMERIC,
    descripcion TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );

  CREATE TABLE sistema_config (
    id TEXT PRIMARY KEY,
    valor TEXT
  );
  INSERT INTO sistema_config (id, valor) VALUES ('tasa_bcv_semanal', '0') ON CONFLICT DO NOTHING;

  CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario TEXT,
    accion TEXT,
    detalles TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );
`;

async function main() {
  try {
    await client.connect();
    console.log('Connected to database');
    await client.query(ddl);
    console.log('Tables recreated successfully');
  } catch (err) {
    console.error('Error executing DDL:', err);
  } finally {
    await client.end();
  }
}

main();
