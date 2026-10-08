const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fixSambilNA() {
  const { data: condo } = await sb.from('condominios').select('id').eq('codigo', 'URB016119').single();
  const { data: units } = await sb.from('condominio_unidades').select('inmueble').eq('condominio_id', condo.id);
  const ids = units.map(u => u.inmueble);
  
  const { data: inms } = await sb.from('inmuebles').select('id, inmueble, actividad_principal, mmv_mes, deuda_mmv, meses_deuda').in('inmueble', ids);
  
  const naUnits = inms.filter(u => !u.actividad_principal || u.actividad_principal === 'N/A' || u.actividad_principal === '');
  
  console.log(`Found ${naUnits.length} N/A units in Sambil.`);
  let fixed = 0;
  for (const unit of naUnits) {
    if (unit.meses_deuda === 1 && unit.deuda_mmv > 0) {
      console.log(`Fixing ${unit.inmueble}: mmv_mes ${unit.mmv_mes} -> ${unit.deuda_mmv}`);
      await sb.from('inmuebles').update({ mmv_mes: unit.deuda_mmv }).eq('id', unit.id);
      fixed++;
    } else {
      console.log(`Skipping ${unit.inmueble}: meses_deuda=${unit.meses_deuda}, deuda_mmv=${unit.deuda_mmv}`);
    }
  }
  console.log(`Fixed ${fixed} units.`);
}
fixSambilNA();
