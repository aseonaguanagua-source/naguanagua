/**
 * Agregar columnas faltantes a la tabla inmuebles
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let SUPABASE_URL = '', SUPABASE_KEY = '';
try {
  const env = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
  SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim() || '';
  SUPABASE_KEY = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || '';
} catch(e) {}

const SQL = `
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS telefono TEXT DEFAULT NULL;
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS correo_electronico TEXT DEFAULT NULL;
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS clasificacion TEXT DEFAULT 'Residencial';
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS notas TEXT DEFAULT NULL;
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS deuda_congelada_bs NUMERIC DEFAULT 0;
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS multa_bs NUMERIC DEFAULT 0;
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS meses_deuda INTEGER DEFAULT 0;
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS condominio_padre_id TEXT DEFAULT NULL;
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS es_condominio BOOLEAN DEFAULT FALSE;
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS agente_retencion BOOLEAN DEFAULT FALSE;
ALTER TABLE inmuebles ADD COLUMN IF NOT EXISTS contribuyente TEXT DEFAULT NULL;
`;

(async () => {
  console.log('🏗️  Ejecutando ALTER TABLE via REST API...\n');
  
  // Use Supabase management API / SQL endpoint
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ sql_query: SQL }),
  });
  
  if (res.ok) {
    console.log('✅ Columnas agregadas exitosamente');
  } else {
    const errText = await res.text();
    console.log('⚠️  La API REST no soporta exec_sql.');
    console.log('   Error:', errText.substring(0, 200));
    console.log('\n📋 Por favor ejecuta este SQL manualmente en Supabase SQL Editor:');
    console.log('   Dashboard → SQL Editor → New Query → Pegar y ejecutar:\n');
    console.log(SQL);
  }
})();
