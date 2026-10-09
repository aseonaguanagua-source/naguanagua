const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// We'll reimplement the resolver just to get the total without next dependencies
async function run() {
  const tasa = 979.08; // user's screenshot
  const FAC = 0.1280;
  
  const {data: condo} = await sb.from('condominios').select('*').ilike('nombre', '%A.S 24 VALENCIA%').single();
  const {data: cUnits} = await sb.from('condominio_unidades').select('*').eq('condominio_id', condo.id);
  
  // To use the real resolver, let's grab the FO from the db if mmv_mes is set, otherwise ord.
  // Wait, the DB table `inmuebles` has `mmv_mes` for these units!
  // `condominio_unidades` doesn't have `mmv_mes`, it has `tarifa_mmv`!
  // In `cargarCondominio`, the units are fetched with `u.tarifa_mmv = u.tarifa_mmv`.
  
  const inms = cUnits.map(u => u.inmueble).filter(Boolean);
  const {data: inmuebles} = await sb.from('inmuebles').select('inmueble, mmv_mes').in('inmueble', inms);
  const mmvMap = new Map();
  if (inmuebles) {
      inmuebles.forEach(i => mmvMap.set(i.inmueble, parseFloat(i.mmv_mes) || 0));
  }
  
  let totalBs = 0;
  
  for (let u of cUnits) {
     if (u.estado === 'Eliminada') continue;
     
     // 1.98 for desocupada
     if (u.estado === 'Desocupada') {
         totalBs += 1.98 * 57 * tasa * FAC;
         continue;
     }
     
     const act = u.actividad || '';
     const isSinAct = /^(N\/?A|NA|NINGUNA|SIN ACTIVIDAD|-)$/i.test(act.trim());
     if (isSinAct) continue; // sin actividad
     
     // What is the mmv?
     let mmv = parseFloat(u.tarifa_mmv);
     if (isNaN(mmv) || mmv === null) {
         mmv = mmvMap.get(u.inmueble) || 0;
     }
     
     // For commercial:
     let fo = 1.98; // fallback
     if (mmv >= 1.54) fo = mmv;
     else {
         // Resolve from ordenanza. We'll just assume `mmv` was already correct if it was in DB,
         // but wait, `mmvMap.get` has the real mmv!
         // Wait, we don't have resolverFOComercial here. Let's just output the units and see the difference.
     }
     
     totalBs += fo * 57 * tasa * FAC;
  }
  
  console.log("Estimated Total Bs (using mmv from db):", totalBs);
  console.log("Unidades activas:", cUnits.filter(u=>u.estado !== 'Eliminada').length);
}
run().catch(console.error);
