require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condo } = await supabase.from('condominios').select('*').eq('codigo', 'URB018483').single();
  const { data: unidades } = await supabase.from('condominio_unidades').select('*').eq('condominio_id', condo.id);
  
  const hmr = unidades.filter(u => JSON.stringify(u).toLowerCase().includes('hotel') || JSON.stringify(u).toLowerCase().includes('hmr') || JSON.stringify(u).toLowerCase().includes('hesperia'));
  console.log("Found:", hmr.length);
  hmr.forEach(h => console.log(h.numero, h.propietario, h.tarifa_mmv));
}
run();
