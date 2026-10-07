const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: inm } = await sb.from('inmuebles').select('*').eq('identidad', 'J-295063008');
  let tDeuda = 0;
  for (const i of inm) {
    tDeuda += Number(i.deuda_mmv || 0) * 984.26261811;
  }
  console.log('Total Deuda en Inmuebles para J-295063008:', tDeuda);
}
check();
