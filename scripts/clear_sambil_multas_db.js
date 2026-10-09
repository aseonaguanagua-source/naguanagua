const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const {data: condo} = await sb.from('condominios').select('*').ilike('nombre', '%A.S 24 VALENCIA%').single();
  const {data: unidades} = await sb.from('condominio_unidades').select('*').eq('condominio_id', condo.id);
  
  const inms = unidades.map(u => u.inmueble).filter(Boolean);
  let count = 0;
  for(let i=0; i<inms.length; i+=100) {
      const batch = inms.slice(i, i+100);
      const {error} = await sb.from('inmuebles').update({ multa_bs: 0 }).in('inmueble', batch);
      if(error) console.error(error);
      else count += batch.length;
  }
  console.log("Limpiados multa_bs para", count, "unidades en la tabla inmuebles.");
}
run().catch(console.error);
