const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const {data: condo} = await sb.from('condominios').select('*').ilike('nombre', '%A.S 24 VALENCIA%').single();
  const {data: unidades} = await sb.from('condominio_unidades').select('*').eq('condominio_id', condo.id);
  
  const inms = unidades.map(u => u.inmueble).filter(Boolean);
  let totalMultaBs = 0;
  for(let i=0; i<inms.length; i+=100) {
      const {data: inmuebles} = await sb.from('inmuebles').select('inmueble, multa_bs').in('inmueble', inms.slice(i, i+100));
      for (const inv of inmuebles) {
          totalMultaBs += parseFloat(inv.multa_bs || 0);
      }
  }
  console.log("Total multa_bs in inmuebles table for Sambil units:", totalMultaBs);
}
run().catch(console.error);
