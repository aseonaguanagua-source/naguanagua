require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condo } = await supabase.from('condominios').select('id, codigo, tarifa_mmv').eq('codigo', 'URB016119').single();
  const { data: units } = await supabase.from('condominio_unidades').select('id, tarifa_mmv, estado, updated_at, estado').eq('condominio_id', condo.id);
  
  const sumActivas = units.filter(u => u.estado !== 'Eliminada').reduce((a, u) => a + (u.tarifa_mmv || 0), 0);
  const sumAll = units.reduce((a, u) => a + (u.tarifa_mmv || 0), 0);
  
  console.log("Condominio:", condo);
  console.log("Activas MMV:", sumActivas);
  console.log("All MMV:", sumAll);
}
run();
