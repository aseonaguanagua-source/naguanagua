const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: inm } = await sb.from('inmuebles').select('*').eq('identidad', 'J-295063008');
  console.log('Inmuebles de J-295063008:', inm.map(i => ({ cod: i.inmueble, act: i.actividad_principal, tipo: i.tipo, mmv: i.mmv_mes })));
}
check();
