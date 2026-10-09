const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const {data: condo} = await sb.from('condominios').select('*').ilike('nombre', '%A.S 24 VALENCIA%').single();
  console.log("Condominio:", condo.nombre, "Tarifa MMV:", condo.tarifa_mmv);
  
  const {data: unidades} = await sb.from('condominio_unidades').select('*').eq('condominio_id', condo.id);
  console.log("Total unidades cargadas:", unidades.length);
  
  // What is the debt calculated?
  const res = await fetch(`http://localhost:3000/api/admin/condominios?codigo=${condo.codigo}`).then(r => r.json()).catch(console.error);
  if (!res) return;
  console.log("Aseo base (Mensualidad Condominio):", res.mensual?.condominioBs);
  console.log("Cantidad cobradas:", res.mensual?.unidadesCobradas);
  
  const primeras5 = res.renglones.slice(0, 5);
  for (const r of primeras5) {
     console.log(`- ${r.actividad}: Mensualidad = Bs ${r.mensualBs}`);
  }
}
run().catch(console.error);
