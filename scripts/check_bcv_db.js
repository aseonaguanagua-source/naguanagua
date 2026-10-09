require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await supabase.from('sistema_config').select('*').in('id', ['tasa_bcv_manual', 'tasa_bcv_semanal']);
  console.log(data);
}
run();
