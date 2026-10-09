const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  console.log("Buscando inmuebles donde identidad == inmueble...");
  const { data, error } = await sb.from('inmuebles').select('id, inmueble, identidad, cod_cont, contribuyente').limit(100000);
  
  if (error) {
    console.error(error);
    return;
  }
  
  const toFix = data.filter(i => i.identidad === i.inmueble);
  console.log(`Se encontraron ${toFix.length} inmuebles donde la identidad es igual al código de local.`);
  
  if (toFix.length > 0) {
    console.log("Ejemplo:", toFix.slice(0, 5));
    // Let's also check if cod_cont has the actual RIF for these
    console.log("¿Tienen cod_cont con el RIF real?", toFix.slice(0, 5).map(x => x.cod_cont));
  }
  
  // also check cod_cont == inmueble just in case the previous script failed silently or I missed it
  const toFix2 = data.filter(i => i.cod_cont === i.inmueble);
  console.log(`Se encontraron ${toFix2.length} inmuebles donde cod_cont == inmueble.`);
  if (toFix2.length > 0) {
    console.log("Ejemplo:", toFix2.slice(0, 5));
  }
}
check();
