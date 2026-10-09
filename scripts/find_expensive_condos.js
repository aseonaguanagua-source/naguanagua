require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condominios } = await supabase.from('condominios').select('id, codigo, nombre');
  for (const c of condominios) {
    const { data: units } = await supabase.from('condominio_unidades').select('tarifa_mmv').eq('condominio_id', c.id).neq('estado', 'Eliminada');
    let sum = 0;
    if (units) {
      sum = units.reduce((a, u) => a + (u.tarifa_mmv || 0), 0);
    }
    if (sum > 1000) {
      console.log(`${c.codigo} | ${c.nombre} | ${sum.toFixed(2)} MMV`);
    }
  }
}
run();
