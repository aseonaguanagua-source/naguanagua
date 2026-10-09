require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: bcv } = await supabase.from('bcv_rates').select('*').limit(5);
  console.log("bcv_rates", bcv);
  
  const { data: bcv2 } = await supabase.from('bcv').select('*').limit(5);
  console.log("bcv", bcv2);
  
  const { data: t } = await supabase.from('tasas_bcv').select('*').limit(5);
  console.log("tasas_bcv", t);
  
  const { data: conf } = await supabase.from('configuracion').select('*');
  console.log("configuracion", conf);
}
run();
