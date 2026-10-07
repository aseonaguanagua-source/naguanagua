const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const path = '/Users/davidzara/Documents/naguanagua_zero/respaldos/respaldo_condominios_fase2_1791325624716.json';
  const resp = JSON.parse(fs.readFileSync(path, 'utf8'));

  const { data: condo } = await sb.from('condominios').select('id, nombre').eq('codigo', 'URB016119').single();
  
  const inDbReq = await sb.from('condominio_unidades').select('inmueble').eq('condominio_id', condo.id);
  const inDb = new Set(inDbReq.data.map(u => u.inmueble));
  
  if (!resp.condominio_unidades) {
    console.log("No condominio_unidades in this backup either.");
    return;
  }
  const inBackup = resp.condominio_unidades.filter(u => u.condominio_id === condo.id);
  
  console.log(`DB has ${inDb.size} units. Backup has ${inBackup.length} units.`);
  
  if (inBackup.length > inDb.size) {
    const missing = inBackup.filter(u => !inDb.has(u.inmueble));
    console.log("Missing from DB:", missing.map(m => m.inmueble));
    
    // We can also insert them back!
    if (missing.length > 0) {
      console.log("To insert:", missing.map(m => ({ inmueble: m.inmueble, condominio_id: m.condominio_id })));
    }
  }
}
check();
