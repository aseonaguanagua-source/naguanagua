const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fixSambilNA() {
  const path = '/Users/davidzara/Documents/naguanagua_zero/respaldos/respaldo_cruce_sigyr_2026-10-06T21-35-01-443Z.json';
  if (!fs.existsSync(path)) return console.log("No backup file");
  const resp = JSON.parse(fs.readFileSync(path, 'utf8'));
  const backupInmuebles = resp.inmuebles;
  const backupMap = new Map();
  for (const i of backupInmuebles) {
    backupMap.set(i.inmueble, i.actividad_principal);
  }

  const { data: condo } = await sb.from('condominios').select('id').eq('codigo', 'URB016119').single();
  const { data: units } = await sb.from('condominio_unidades').select('inmueble').eq('condominio_id', condo.id);
  
  const ids = units.map(u => u.inmueble);
  
  // Fetch inmuebles in chunks to avoid URL too long error
  let inms = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data, error } = await sb.from('inmuebles').select('inmueble, actividad_principal').in('inmueble', chunk);
    if (error) console.error(error);
    if (data) inms.push(...data);
  }
  
  const naUnits = inms.filter(u => !u.actividad_principal || u.actividad_principal === 'N/A' || u.actividad_principal === '');
  console.log(`Total N/A units found in DB for Sambil: ${naUnits.length}`);
  
  let fixedCount = 0;
  for (const unit of naUnits) {
    const oldAct = backupMap.get(unit.inmueble);
    if (oldAct && oldAct !== 'N/A' && oldAct !== '') {
      console.log(`Fixing ${unit.inmueble}: N/A -> ${oldAct}`);
      await sb.from('inmuebles').update({ actividad_principal: oldAct }).eq('inmueble', unit.inmueble);
      fixedCount++;
    } else {
      console.log(`Could not find real activity for ${unit.inmueble} in backup. (Old was: ${oldAct})`);
    }
  }
  
  console.log(`Fixed ${fixedCount} units.`);
}
fixSambilNA();
