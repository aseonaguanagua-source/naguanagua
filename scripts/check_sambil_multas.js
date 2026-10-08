const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSambilMultas() {
  const { data } = await sb.from('condominio_multas').select('*').eq('condominio_id', '7567ec01-6d34-4341-bc5b-5a69c64cba93');
  console.log("Multas:", data);
}
checkSambilMultas();
