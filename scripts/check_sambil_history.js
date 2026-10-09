require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condo } = await supabase.from('condominios').select('*').eq('codigo', 'URB016119').single();
  console.log("Sambil updated_at:", condo.updated_at);
  console.log("Tarifa_mmv:", condo.tarifa_mmv);
  console.log("Modalidad:", condo.modalidad);
}
run();
