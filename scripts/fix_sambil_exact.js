require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condo } = await supabase.from('condominios').select('id, codigo').eq('codigo', 'URB016119').single();
  
  const { error } = await supabase.from('condominios').update({
    modalidad: 'TARIFA_FIJA',
    tarifa_fija_bs: 0,
    tarifa_mmv: 2645.4
  }).eq('id', condo.id);
  
  if (error) console.error(error);
  else console.log("Sambil fixed to exactly 2645.4 MMV (TARIFA_FIJA)");
}
run();
