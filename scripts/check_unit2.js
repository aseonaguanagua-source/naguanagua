const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: u } = await sb.from('condominio_unidades').select('*').eq('inmueble', 'URB016160').single();
  console.log(u);
}
check();
