const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkTotal() {
  const { data: condo } = await sb.from('condominios').select('id').eq('codigo', 'URB016119').single();
  const { data: units } = await sb.from('condominio_unidades').select('inmueble').eq('condominio_id', condo.id);
  const ids = units.map(u => u.inmueble);
  
  const { data: inms } = await sb.from('inmuebles').select('deuda_mmv').in('inmueble', ids);
  
  let totalMmv = 0;
  for (const i of inms) {
    totalMmv += (i.deuda_mmv || 0);
  }
  console.log("Total deuda_mmv:", totalMmv);
  // Assuming tasa MMV is ~55927
  console.log("Approx Bs:", totalMmv * 55927.26);
}
checkTotal();
