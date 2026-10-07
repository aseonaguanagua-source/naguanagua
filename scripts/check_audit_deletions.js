const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: audit } = await sb.from('auditoria').select('*').order('created_at', { ascending: false }).limit(20);
  console.log(audit.map(a => `${a.created_at} | ${a.accion} | ${JSON.stringify(a.detalles).slice(0, 100)}`));
}
check();
