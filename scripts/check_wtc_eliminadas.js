require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condo } = await supabase.from('condominios').select('*').eq('codigo', 'URB018483').single();
  const { data: eliminadas } = await supabase.from('condominio_unidades').select('*').eq('condominio_id', condo.id).eq('estado', 'Eliminada');
  
  let totalMmv = 0;
  eliminadas.forEach(u => {
    totalMmv += u.tarifa_mmv || 0;
    console.log(`Eliminada: ${u.propietario} | MMV: ${u.tarifa_mmv}`);
  });
  console.log(`Total eliminadas: ${eliminadas.length}`);
  console.log(`Suma MMV eliminadas: ${totalMmv.toFixed(4)}`);
}
run();
