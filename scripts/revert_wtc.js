require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  await supabase.from('condominios').update({
    modalidad: 'MIXTO_COMERCIAL',
    tarifa_fija_bs: null,
    tarifa_mmv: null
  }).eq('codigo', 'URB018483');
  
  console.log("WTC Reverted to MIXTO_COMERCIAL (dynamic sum)");
}
run();
