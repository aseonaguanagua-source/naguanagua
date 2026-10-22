const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data: p } = await sb.from('pagos_reportados').select('*').eq('id', 'c9fd2690-ef81-4bc2-86aa-538b4468f35c').single();
  console.log('Detalles completos:', JSON.stringify(p, null, 2));
}

main().catch(console.error);
