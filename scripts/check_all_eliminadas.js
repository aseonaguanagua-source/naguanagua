require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: eliminadas } = await supabase.from('condominio_unidades').select('id, propietario, condominio_id, tarifa_mmv').eq('estado', 'Eliminada');
  
  let total = 0;
  let mmv = 0;
  
  eliminadas.forEach(u => {
    const prop = u.propietario ? u.propietario.toUpperCase() : '';
    if (!prop.includes('HMR') && !prop.includes('HESPERIA')) {
      total++;
      mmv += u.tarifa_mmv || 0;
    }
  });
  
  console.log(`There are ${total} 'Eliminada' units across ALL condominios (excluding HMR).`);
  console.log(`They sum to ${mmv.toFixed(2)} MMV.`);
}
run();
