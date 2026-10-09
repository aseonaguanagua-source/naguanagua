require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await supabase.from('condominios').select('id, codigo, nombre, tarifa_mmv, tarifa_fija_bs').gt('tarifa_mmv', 1000);
  console.log("High tarifa_mmv:", data);
}
run();
