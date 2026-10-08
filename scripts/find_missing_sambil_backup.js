const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const path = '/Users/davidzara/Documents/naguanagua_zero/respaldos/respaldo_cruce_sigyr_2026-10-06T21-35-01-443Z.json';
  if (!fs.existsSync(path)) {
    console.log("No backup"); return;
  }
  const resp = JSON.parse(fs.readFileSync(path, 'utf8'));
  
  // Condominio Sambil is URB016119
  // Wait, in the backup `inmuebles` might not have condominio_id.
  // But they might have `direccion` like "%SAMBIL%"
  const sambilBackup = resp.inmuebles.filter(i => 
    (i.direccion && i.direccion.includes('SAMBIL')) ||
    (i.nombre && i.nombre.includes('SAMBIL'))
  );
  
  console.log("Total in backup with SAMBIL in direccion/nombre:", sambilBackup.length);
  
  // Get current Sambil units
  const { data: current } = await sb.from('condominio_unidades')
    .select('inmueble, condominios!inner(codigo)')
    .eq('condominios.codigo', 'URB016119');
    
  const currentIds = current.map(c => c.inmueble);
  console.log("Current Sambil units count:", currentIds.length);
  
  // Also get current all units just to be safe
  const { data: allCurrent } = await sb.from('inmuebles').select('inmueble');
  const allCurrentIds = new Set(allCurrent.map(i => i.inmueble));
  
  const missingFromDB = sambilBackup.filter(b => !allCurrentIds.has(b.inmueble));
  console.log("Missing from DB completely:", missingFromDB.length);
  
  const missingFromCondo = sambilBackup.filter(b => !currentIds.includes(b.inmueble) && allCurrentIds.has(b.inmueble));
  console.log("In DB but not in Sambil condo:", missingFromCondo.length);
  
  let debtMissing = 0;
  for (const m of missingFromDB) {
    console.log(m.inmueble, m.actividad_principal, m.deuda_inicial);
    debtMissing += (m.deuda_inicial || 0);
  }
  
  console.log("Total missing debt:", debtMissing);
}
run();
