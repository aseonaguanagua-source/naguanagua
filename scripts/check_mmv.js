const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: condo } = await sb.from('condominios').select('*').eq('codigo', 'URB016119').single();
  const { data: unidades } = await sb.from('condominio_unidades').select('*').eq('condominio_id', condo.id);

  const totalMmv = unidades.reduce((s, u) => s + Number(u.tarifa_mmv || 0), 0);
  console.log('Total MMV en unidades:', totalMmv);
}
check();
