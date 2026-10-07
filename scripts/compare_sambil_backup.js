const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const path = '/Users/davidzara/Documents/naguanagua_zero/respaldos/respaldo_cruce_sigyr_2026-10-06T21-35-01-443Z.json';
  const resp = JSON.parse(fs.readFileSync(path, 'utf8'));

  const { data: condo } = await sb.from('condominios').select('id, nombre').eq('codigo', 'URB016119').single();
  
  const inDbReq = await sb.from('condominio_unidades').select('inmueble').eq('condominio_id', condo.id);
  const inDb = new Set(inDbReq.data.map(u => u.inmueble));
  
  // Find in backup
  // Wait, does the backup have 'condominio_unidades'?
  if (!resp.condominio_unidades) {
    console.log("No condominio_unidades in backup. Looking for other backups...");
    return;
  }
  const inBackup = resp.condominio_unidades.filter(u => u.condominio_id === condo.id);
  
  console.log(`DB has ${inDb.size} units. Backup has ${inBackup.length} units.`);
}
check();
