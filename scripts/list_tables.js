const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await sb.from('Cuentas Bancarias').select('*').limit(1).catch(e => ({error: e}));
  console.log("Cuentas Bancarias:", data);
}
run();
