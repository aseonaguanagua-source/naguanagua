const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkNA() {
  const { data: condo } = await sb.from('condominios').select('id').eq('codigo', 'URB016119').single();
  const { data: units } = await sb.from('condominio_unidades').select('inmueble').eq('condominio_id', condo.id);
  const ids = units.map(u => u.inmueble);
  
  const { data: inms } = await sb.from('inmuebles').select('inmueble, actividad_principal, tarifa_aseo, nombre').in('inmueble', ids);
  
  const naUnits = inms.filter(u => !u.actividad_principal || u.actividad_principal === 'N/A' || u.actividad_principal === '');
  console.log(`Total N/A units: ${naUnits.length}`);
  for (let i = 0; i < Math.min(10, naUnits.length); i++) {
    console.log(naUnits[i].inmueble, naUnits[i]);
  }
}
checkNA();
