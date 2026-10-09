require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condo } = await supabase.from('condominios').update({
    modalidad: 'TARIFA_FIJA',
    tarifa_fija_bs: 0,
    tarifa_mmv: 918.046875
  }).eq('codigo', 'URB018483').select().single();
  
  console.log("WTC Updated to TARIFA_FIJA flat rate MMV:", condo.tarifa_mmv);
}
run();
