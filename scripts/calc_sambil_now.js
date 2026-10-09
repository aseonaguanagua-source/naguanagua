const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const fetch = require('node-fetch');

async function run() {
  const {data: condo} = await sb.from('condominios').select('*').ilike('nombre', '%A.S 24 VALENCIA%').single();
  // Clear tarifa_mmv locally so we simulate what the user sees when they clear it
  await sb.from('condominios').update({tarifa_mmv: null}).eq('id', condo.id);
  
  const res = await fetch(`http://localhost:3000/api/admin/condominios?codigo=${condo.codigo}`).then(r => r.json()).catch(console.error);
  if (!res) {
     console.log("Next server is down, cannot query calculateEstado");
     return;
  }
  
  console.log("Aseo Total calculated:", res.mensual?.condominioBs);
}
run().catch(console.error);
