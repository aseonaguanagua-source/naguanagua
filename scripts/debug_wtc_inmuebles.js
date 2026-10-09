require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condo } = await supabase.from('condominios').select('id').eq('codigo', 'URB018483').single();
  const { data: unidades, error: uErr } = await supabase.from('condominio_unidades').select('*').eq('condominio_id', condo.id);
  
  if (uErr) { console.error("uErr", uErr); return; }
  
  const inmsIds = unidades.map(u => u.inmueble).filter(Boolean);
  console.log("Found inmsIds:", inmsIds.length);
  
  if (inmsIds.length === 0) {
    console.log("No inmuebles associated with these units!");
    return;
  }
  
  const { data: inmuebles, error: iErr } = await supabase.from('inmuebles').select('id, mmv_mes, actividad_principal').in('id', inmsIds);
  if (iErr) { console.error("iErr", iErr); return; }
  console.log("Found inmuebles:", inmuebles.length);
}
run();
