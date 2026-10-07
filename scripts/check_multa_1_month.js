const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: condo } = await sb.from('condominios').select('*').eq('codigo', 'URB016119').single();
  const { data: unidades } = await sb.from('condominio_unidades').select('*').eq('condominio_id', condo.id);

  let multaTotal = 0;
  for (const u of unidades) {
    const isRes = u.tipo === 'RESIDENCIAL'; // simplified
    const tMulta = isRes ? 0.10 : 0.12;
    const mensualBs = Number(u.tarifa_mmv || 0) * 984.26261811;
    multaTotal += mensualBs * tMulta * 1; // Assuming 1 month of multa
  }
  console.log('Multa for 1 month:', multaTotal);
}
check();
