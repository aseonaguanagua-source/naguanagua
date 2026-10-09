const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const {data: condo} = await sb.from('condominios').select('*').ilike('nombre', '%A.S 24 VALENCIA%').single();
  const {data: cUnits} = await sb.from('condominio_unidades').select('inmueble').eq('condominio_id', condo.id);
  const cUnitSet = new Set(cUnits.map(u => u.inmueble));
  
  // Sambil hijo in inmuebles is probably N/A under A.S 24
  const {data: hijo} = await sb.from('inmuebles').select('inmueble').eq('condominio_padre_id', condo.codigo).single();
  
  // Nietos
  const {data: nietos} = await sb.from('inmuebles').select('inmueble, contribuyente, actividad_principal').eq('condominio_padre_id', hijo.inmueble);
  
  console.log("Nietos en inmuebles:", nietos.length);
  console.log("Unidades en condominio_unidades:", cUnits.length);
  
  const missing = nietos.filter(n => !cUnitSet.has(n.inmueble));
  console.log("Faltan en condominio_unidades:", missing.length);
  console.log("Sample missing:", missing.slice(0, 3));
}
run().catch(console.error);
