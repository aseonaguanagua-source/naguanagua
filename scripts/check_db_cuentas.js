const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await sb.from('admin_finanzas_cuentas').select('*');
  console.log("admin_finanzas_cuentas:", data);
  if (error) console.log("Error:", error);
}
run();
