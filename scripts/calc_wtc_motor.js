require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { cargosPorUnidad } = require('./src/lib/condominios/motor.ts');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condo } = await supabase.from('condominios').select('*').eq('codigo', 'URB018483').single();
  const { data: unidades } = await supabase.from('condominio_unidades').select('*').eq('condominio_id', condo.id);
  
  console.log("Condo:", condo.nombre, "Cant declarada:", condo.cant_declarada);
  console.log("Unidades registradas:", unidades.length);
  
  let totalMmv = 0;
  
  unidades.forEach(u => {
    // Si la unidad está desocupada o activa, etc.
    let mmv = u.tarifa_mmv || 0;
    if (u.estado === 'Desocupada') mmv = 1.98;
    totalMmv += mmv;
  });
  
  const noRegistradas = condo.cant_declarada - unidades.length;
  if (noRegistradas > 0) {
    totalMmv += (noRegistradas * 1.98);
  }
  
  console.log("Total MMV calculado:", totalMmv);
}
run();
