const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: condo } = await sb.from('condominios').select('*').eq('codigo', 'URB016119').single();
  const { data: unidades } = await sb.from('condominio_unidades').select('inmueble, aseo_pendiente_desde').eq('condominio_id', condo.id);

  console.log('Distintos meses pendientes:');
  const counts = {};
  unidades.forEach(u => {
    const d = u.aseo_pendiente_desde || 'NULL';
    counts[d] = (counts[d] || 0) + 1;
  });
  console.log(counts);
}
check();
