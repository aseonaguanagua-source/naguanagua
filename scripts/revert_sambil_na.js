const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function revertSambilNA() {
  const ids = [
    'URB016120', 'URB016127', 'URB016228', 'URB016263', 'URB016347',
    'URB016361', 'URB033578', 'URB033580', 'URB033582', 'URB033583',
    'URB033584', 'URB033585', 'URB033588', 'URB033591', 'URB033592',
    'URB033594', 'URB033596', 'URB033598', 'URB033600', 'URB035218',
    'URB035219', 'URB035221'
  ];
  
  for (const id of ids) {
    await sb.from('inmuebles').update({ mmv_mes: 1.98 }).eq('inmueble', id);
    console.log(`Reverted ${id} to mmv_mes 1.98`);
  }
}
revertSambilNA();
