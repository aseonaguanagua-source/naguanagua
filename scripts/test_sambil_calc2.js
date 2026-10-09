const path = require('path');
require('dotenv').config({ path: '.env.local' });
// Import Next.js TS compiler if needed, but we can't easily run TS from Node here.
// Let's write a simple query:
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const {data: condo} = await sb.from('condominios').select('*').ilike('nombre', '%A.S 24 VALENCIA%').single();
  console.log("Condominio:", condo.nombre, "Tarifa MMV:", condo.tarifa_mmv);
  
  const {data: unidades} = await sb.from('condominio_unidades').select('*').eq('condominio_id', condo.id);
  
  // Just show what activities they have
  let acts = {};
  for(let u of unidades) {
     acts[u.actividad] = (acts[u.actividad] || 0) + 1;
  }
  console.log("Actividades de las unidades de Sambil:", acts);
}
run().catch(console.error);
