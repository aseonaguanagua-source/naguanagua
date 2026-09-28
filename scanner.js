const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function scan() {
  console.log("=== INICIANDO ESCANEO DE ERRORES EN BD ===");
  
  // 1. Inmuebles duplicados (mismo código URB/CM)
  const { data: inms } = await supabase.from('inmuebles').select('inmueble');
  const counts = {};
  let dups = 0;
  for(let i of inms) {
    if(i.inmueble) {
       counts[i.inmueble] = (counts[i.inmueble]||0)+1;
       if(counts[i.inmueble] === 2) dups++;
    }
  }
  console.log(`- Inmuebles duplicados: ${dups}`);

  // 2. Facturas sin referencia
  const { data: fNoRef } = await supabase.from('facturas').select('id').is('referencia', null);
  console.log(`- Facturas sin referencia (rotas): ${fNoRef ? fNoRef.length : 0}`);

  // 3. Contribuyentes sin clasificacion
  const { data: cNoClasif } = await supabase.from('contribuyentes').select('Identidad').is('Clasificacion', null);
  console.log(`- Contribuyentes sin Clasificación: ${cNoClasif ? cNoClasif.length : 0}`);
  
  // 4. Inmuebles con deuda MMV pero meses_deuda = 0
  const { data: iDeudaGhost } = await supabase.from('inmuebles').select('inmueble, deuda_mmv, meses_deuda').gt('deuda_mmv', 0).eq('meses_deuda', 0);
  console.log(`- Inmuebles con deuda MMV pero 0 meses de mora (Ghost Debt): ${iDeudaGhost ? iDeudaGhost.length : 0}`);

  console.log("=== FIN DEL ESCANEO ===");
}
scan();
