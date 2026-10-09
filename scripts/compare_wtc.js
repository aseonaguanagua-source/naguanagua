require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: condo } = await supabase.from('condominios').select('id').eq('codigo', 'URB018483').single();
  const { data: unidades } = await supabase.from('condominio_unidades').select('*').eq('condominio_id', condo.id);
  
  const inmsIds = unidades.map(u => u.inmueble).filter(Boolean);
  const { data: inmuebles } = await supabase.from('inmuebles').select('inmueble, mmv_mes, actividad_principal').in('inmueble', inmsIds);
  const inmsMap = new Map(inmuebles.map(i => [i.inmueble, i]));
  
  let oldMmvSum = 0;
  let newMmvSum = 0;
  let differences = [];
  
  unidades.forEach(u => {
    const inm = u.inmueble ? inmsMap.get(u.inmueble) : null;
    const oldMmv = inm ? (inm.mmv_mes || 0) : 0;
    const newMmv = u.estado === 'Eliminada' ? 0 : (u.tarifa_mmv || 0);
    
    oldMmvSum += oldMmv;
    newMmvSum += newMmv;
    
    if (u.estado === 'Eliminada' && oldMmv > 0) {
      differences.push(`[INACTIVO AHORA] Local ${u.numero} | Propietario: ${u.propietario} | Old MMV: ${oldMmv.toFixed(2)}`);
    } else if (Math.abs(oldMmv - newMmv) > 0.01 && u.estado !== 'Eliminada') {
      differences.push(`[CAMBIO DE MMV] Local ${u.numero} | Act: ${u.actividad?.substring(0,20)} | Old: ${oldMmv.toFixed(2)} -> New: ${newMmv.toFixed(2)}`);
    }
  });
  
  console.log(`Suma OLD MMV (152 locales en sistema viejo): ${oldMmvSum.toFixed(2)}`);
  console.log(`Suma NEW MMV (Locales Activos ahora): ${newMmvSum.toFixed(2)}`);
  console.log("\nDiferencias encontradas:");
  differences.forEach(d => console.log(d));
}
run();
