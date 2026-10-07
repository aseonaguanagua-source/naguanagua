const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: audit } = await sb.from('auditoria').select('*').eq('accion', 'Cruce SIGYR: corrección eliminados/desactivados').limit(1);
  if (audit.length) console.log(audit[0].detalles.unidades_quitadas);
}
check();
