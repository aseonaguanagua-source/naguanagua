const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSambilUnits() {
  const { data } = await sb.from('condominio_unidades').select('*').eq('condominio_id', '7567ec01-6d34-4341-bc5b-5a69c64cba93');
  console.log(`Sambil has ${data ? data.length : 0} units attached in condominio_unidades.`);
  if (data && data.length > 0) {
      console.log(data.slice(0, 5));
  }
}
checkSambilUnits();
