const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: audit } = await sb.from('auditoria')
    .select('*')
    .or('accion.ilike.%elimin%,detalles.ilike.%17%')
    .order('created_at', { ascending: false })
    .limit(50);
  
  audit.forEach(a => {
    const s = JSON.stringify(a.detalles);
    if (s.includes('17') || a.accion.toLowerCase().includes('elimin')) {
      console.log(a.created_at, a.accion, s.slice(0, 100));
    }
  });
}
check();
