require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  let from = 0;
  let limit = 1000;
  let all = [];
  
  while(true) {
    const { data, error } = await supabase.from('auditoria')
      .select('created_at, usuario, accion, detalles')
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);
      
    if (error || !data || data.length === 0) break;
    all = all.concat(data);
    from += limit;
    if (all.length > 20000) break;
  }
  
  const related = all.filter(r => {
    const detStr = JSON.stringify(r.detalles || {});
    return detStr.includes('URB018483') || detStr.includes('URB018598');
  });
  
  console.log(`Auditorías encontradas: ${related.length}`);
  for (const r of related) {
    console.log(`[${new Date(r.created_at).toLocaleString('es-VE', { timeZone: 'America/Caracas'})}] Usuario: ${r.usuario} | Acción: ${r.accion}`);
    if (r.accion.toLowerCase().includes('inmueble') || r.accion.toLowerCase().includes('condominio') || r.accion.toLowerCase().includes('edición')) {
       console.log(`   -> Detalles:`, JSON.stringify(r.detalles).substring(0, 300));
    }
  }
}
run();
