const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSambilCondo() {
  const { data } = await sb.from('inmuebles').select('*').eq('inmueble', 'URB016119');
  console.log("Sambil Condo:", data);
  const { data: c } = await sb.from('condominios').select('*').eq('codigo', 'URB016119');
  console.log("Condominios row:", c);
}
checkSambilCondo();
