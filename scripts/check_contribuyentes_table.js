const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  console.log("Buscando en tabla contribuyentes...");
  const { data, error } = await sb.from('contribuyentes').select('id, nombre, identidad').limit(100000);
  
  if (error) {
    console.error(error);
    return;
  }
  
  // Find duplicate contribuyentes by identidad
  const idCount = {};
  data.forEach(c => {
    if (!idCount[c.identidad]) idCount[c.identidad] = 0;
    idCount[c.identidad]++;
  });
  
  const duplicatedIds = Object.keys(idCount).filter(k => idCount[k] > 1);
  console.log(`Se encontraron ${duplicatedIds.length} identidades duplicadas en la tabla contribuyentes.`);
  if (duplicatedIds.length > 0) {
    console.log("Ejemplo de identidades duplicadas:", duplicatedIds.slice(0, 5));
  }
  
  // Find contribuyentes where identidad starts with URB (local code instead of cedula/rif)
  const badId = data.filter(c => c.identidad && c.identidad.startsWith('URB'));
  console.log(`Se encontraron ${badId.length} contribuyentes donde identidad empieza con URB.`);
  if (badId.length > 0) {
    console.log("Ejemplo:", badId.slice(0, 5));
  }
}
check();
