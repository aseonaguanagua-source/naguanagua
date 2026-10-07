const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function findSambil() {
  const { data } = await sb.from('condominios').select('id, codigo, nombre').ilike('nombre', '%sambil%');
  console.log("Condominios Sambil:", data);
}
findSambil();
