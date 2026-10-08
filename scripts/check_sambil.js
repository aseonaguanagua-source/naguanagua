const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSambil() {
  const { data } = await sb.from('inmuebles').select('id, inmueble, multa_bs, mmv_mes').ilike('direccion', '%sambil%');
  console.log("Current Sambil rows:", data);
}
checkSambil();
