const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data } = await sb.from('cuentas_bancarias').select('*');
  console.log("cuentas_bancarias:", data);
  const { data: d2 } = await sb.from('bancos').select('*');
  console.log("bancos:", d2);
}
run();
