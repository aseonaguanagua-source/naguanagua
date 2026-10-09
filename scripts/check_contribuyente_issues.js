const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkIssues() {
  console.log("1. Buscando inmuebles duplicados...");
  
  // To find duplicates, we can fetch all inmuebles and count them in memory
  // Or we can use RPC. Let's just fetch all `inmueble` codes (there are ~16k)
  const { data: allInms, error: err1 } = await sb.from('inmuebles').select('id, inmueble');
  if (err1) {
    console.error("Error al buscar inmuebles:", err1);
    return;
  }
  
  const inmsByCode = {};
  const duplicatedCodes = new Set();
  
  allInms.forEach(i => {
    if (!i.inmueble) return;
    if (inmsByCode[i.inmueble]) {
      duplicatedCodes.add(i.inmueble);
    } else {
      inmsByCode[i.inmueble] = 1;
    }
  });
  
  console.log(`Se encontraron ${duplicatedCodes.size} códigos de inmueble duplicados.`);
  if (duplicatedCodes.size > 0) {
    console.log("Ejemplo de duplicados:", Array.from(duplicatedCodes).slice(0, 10));
  }

  console.log("\n2. Buscando inmuebles donde cod_cont == inmueble (debería ser su cédula o RIF)...");
  
  const { data: badCodCont, error: err2 } = await sb.from('inmuebles').select('id, inmueble, cod_cont, identidad, contribuyente').limit(100000);
  if (err2) {
    console.error(err2);
    return;
  }
  
  const toFix = badCodCont.filter(i => i.cod_cont === i.inmueble);
  console.log(`Se encontraron ${toFix.length} inmuebles donde cod_cont es igual al código de local en vez de la identidad.`);
  if (toFix.length > 0) {
    console.log("Ejemplo de los que tienen el error:", toFix.slice(0, 5));
  }
  
}
checkIssues();
