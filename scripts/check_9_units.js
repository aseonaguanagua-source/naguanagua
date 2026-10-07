const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const ids = ['URB015608', 'URB015607', 'URB017120', 'URB016581', 'URB016647', 'URB016633', 'URB016632', 'URB016631', 'URB016503'];
  const { data } = await sb.from('inmuebles').select('inmueble, direccion').in('inmueble', ids);
  console.log(data);
}
check();
