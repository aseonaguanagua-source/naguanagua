require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data } = await supabase.from('tasas_bcv').select('*').limit(5);
  console.log(data);
  const { data: d2 } = await supabase.from('bcv_rates').select('*').limit(5);
  console.log(d2);
}
run();
