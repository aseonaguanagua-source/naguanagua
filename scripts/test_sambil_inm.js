const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const {data: condo} = await sb.from('condominios').select('*').ilike('nombre', '%A.S 24 VALENCIA%').single();
  const {data: cUnits} = await sb.from('condominio_unidades').select('inmueble').eq('condominio_id', condo.id);
  const cUnitSet = new Set(cUnits.map(u => u.inmueble));
  
  // Find ALL units in `inmuebles` that have `condominio_padre_id = condo.codigo`
  // Sambil could be Padre, and its units could be Hijos, OR it could be Padre -> Hijo -> Nietos
  const {data: hijos} = await sb.from('inmuebles').select('inmueble').eq('condominio_padre_id', condo.codigo);
  let allUnits = [];
  
  for(let h of hijos) {
     const {data: nietos} = await sb.from('inmuebles').select('inmueble, contribuyente, actividad_principal').eq('condominio_padre_id', h.inmueble);
     allUnits.push(...nietos);
     // also include hijo if it's a unit itself
     allUnits.push({inmueble: h.inmueble, contribuyente: 'HIJO'});
  }
  
  // If no hijos/nietos found, maybe they are just directly linked to condo.codigo
  if (hijos.length === 0) {
      const {data: directUnits} = await sb.from('inmuebles').select('inmueble, contribuyente, actividad_principal').eq('condominio_padre_id', condo.codigo);
      allUnits.push(...directUnits);
  }
  
  console.log("Found in inmuebles (Hijos/Nietos):", allUnits.length);
  
  const missing = allUnits.filter(n => n.inmueble && !cUnitSet.has(n.inmueble) && n.contribuyente !== 'HIJO');
  console.log("Faltan en condominio_unidades:", missing.length);
  console.log("Sample missing:", missing.slice(0, 3));
}
run().catch(console.error);
