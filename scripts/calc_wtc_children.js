require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: hijos } = await supabase.from('inmuebles').select('*').eq('condominio_padre_id', 'URB018483');
  
  let totalMmvMes = 0;
  let totalDeudaMmv = 0;
  hijos.forEach(h => {
    totalMmvMes += h.mmv_mes || 0;
    totalDeudaMmv += h.deuda_mmv || 0;
  });
  
  console.log(`Hijos: ${hijos.length}`);
  console.log(`Sum mmv_mes hijos: ${totalMmvMes}`);
  console.log(`Sum deuda_mmv hijos: ${totalDeudaMmv}`);
}
run();
