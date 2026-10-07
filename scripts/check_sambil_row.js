const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: condo } = await sb.from('condominios').select('*').eq('codigo', 'URB016119').single();
  console.log('Condominio Sambil:', condo);
}
check();
