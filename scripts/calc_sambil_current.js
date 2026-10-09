require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condo } = await supabase.from('condominios').select('id').eq('codigo', 'URB016119').single();
  const { data: units } = await supabase.from('condominio_unidades').select('tarifa_mmv').eq('condominio_id', condo.id).neq('estado', 'Eliminada');
  const sum = units.reduce((a, u) => a + (u.tarifa_mmv || 0), 0);
  console.log(`Sambil Active MMV: ${sum.toFixed(2)}`);
  
  const baseBs = sum * 57 * 980.61 * 0.1280;
  console.log(`Deuda Base Bs: ${baseBs.toFixed(2)}`);
  console.log(`Deuda Total Bs (con IVA): ${(baseBs * 1.16).toFixed(2)}`);
}
run();
