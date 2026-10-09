const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await sb.from('condominios').select('*').limit(5);
  console.log("Condominios:", data);
  const { count } = await sb.from('condominios').select('*', { count: 'exact', head: true });
  console.log("Total condominios:", count);
}
run();
