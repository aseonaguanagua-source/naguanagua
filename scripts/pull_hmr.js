require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condo } = await supabase.from('condominios').select('id').eq('codigo', 'URB018483').single();
  const { data: hmrUnits } = await supabase.from('condominio_unidades').select('*').eq('condominio_id', condo.id).ilike('propietario', '%hmr%');
  const { data: hespUnits } = await supabase.from('condominio_unidades').select('*').eq('condominio_id', condo.id).ilike('propietario', '%hesperia%');
  
  console.log("HMR units to pull:", hmrUnits.length);
  console.log("Hesperia units to pull:", hespUnits.length);
  
  const allToPull = [...hmrUnits, ...hespUnits];
  
  for (let u of allToPull) {
    // console.log(`Pulling ${u.numero} - ${u.propietario}`);
  }
}
run();
