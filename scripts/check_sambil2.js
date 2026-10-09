require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condo } = await supabase.from('condominios').select('id, codigo, nombre, modalidad, tarifa_fija_bs, tarifa_mmv').ilike('nombre', '%SAMBIL%');
  console.log(condo);
}
run();
