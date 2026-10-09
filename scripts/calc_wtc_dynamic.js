require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condo } = await supabase.from('condominios').select('*').eq('codigo', 'URB018483').single();
  const { data: unidades } = await supabase.from('condominio_unidades').select('*').eq('condominio_id', condo.id).neq('estado', 'Eliminada');
  
  let totalMmv = 0;
  unidades.forEach(u => {
    totalMmv += u.tarifa_mmv || 0;
  });
  
  const tasaBCV = 980.6147;
  const baseBs = totalMmv * 57 * tasaBCV * 0.1280;
  
  console.log(`Total locales activos WTC: ${unidades.length}`);
  console.log(`Suma MMV de los locales: ${totalMmv.toFixed(4)}`);
  console.log(`Base Mensual Bs: ${baseBs.toFixed(2)}`);
  console.log(`IVA (16%): ${(baseBs * 0.16).toFixed(2)}`);
  console.log(`Total a pagar (1 mes): ${(baseBs * 1.16).toFixed(2)}`);
}
run();
