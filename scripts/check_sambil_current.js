const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: condo } = await sb.from('condominios').select('id, nombre').eq('codigo', 'URB016119').single();
  const { data: uds } = await sb.from('condominio_unidades').select('id, inmueble').eq('condominio_id', condo.id);
  console.log("Current Sambil units in db:", uds.length);
}
check();
