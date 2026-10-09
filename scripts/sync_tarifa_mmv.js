const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const {data: condo} = await sb.from('condominios').select('id, codigo').ilike('nombre', '%A.S 24 VALENCIA%').single();
  const {data: cUnits} = await sb.from('condominio_unidades').select('id, inmueble').eq('condominio_id', condo.id);
  
  const inms = cUnits.map(u => u.inmueble).filter(Boolean);
  const {data: inmuebles} = await sb.from('inmuebles').select('inmueble, mmv_mes').in('inmueble', inms);
  
  const mmvMap = new Map();
  inmuebles.forEach(i => mmvMap.set(i.inmueble, parseFloat(i.mmv_mes) || null));
  
  let updated = 0;
  for (let i = 0; i < cUnits.length; i += 100) {
      const batch = cUnits.slice(i, i+100);
      for (const u of batch) {
          const mmv = mmvMap.get(u.inmueble);
          if (mmv !== undefined && mmv !== null) {
              await sb.from('condominio_unidades').update({ tarifa_mmv: mmv }).eq('id', u.id);
              updated++;
          }
      }
  }
  console.log(`Updated tarifa_mmv for ${updated} units.`);
}

run().catch(console.error);
