require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: hijos } = await supabase.from('inmuebles').select('id, mmv_mes, actividad_principal, tarifa_calculada_mmv').eq('condominio_padre_id', 'URB018483');
  
  if (!hijos) {
    console.log("No hijos found");
    return;
  }
  
  let changed = 0;
  let totalOld = 0;
  let totalNew = 0;
  
  hijos.forEach(u => {
    const oldMmv = u.mmv_mes || 0;
    const newMmv = u.tarifa_calculada_mmv || oldMmv; // use the calculated one or old if missing
    
    if (Math.abs(oldMmv - newMmv) > 0.01) {
      changed++;
    }
    totalOld += oldMmv;
    totalNew += newMmv;
  });
  
  console.log(`Total locales WTC analizados: ${hijos.length}`);
  console.log(`Locales que cambiaron su MMV vs el sistema viejo: ${changed}`);
  console.log(`Suma MMV Sistema Viejo: ${totalOld.toFixed(2)}`);
  console.log(`Suma MMV Sistema Nuevo (Recalculado): ${totalNew.toFixed(2)}`);
}
run();
