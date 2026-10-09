const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSambilInDb() {
  const { data, error } = await sb.from('inmuebles')
    .select('inmueble, direccion, actividad_principal, tipo, estado')
    .ilike('direccion', '%SAMBIL%');
    
  if(error) {
    console.log("Error:", error);
    return;
  }
  
  console.log(`Found ${data.length} units with SAMBIL in direccion.`);
  
  const missingAct = data.filter(d => !d.actividad_principal || d.actividad_principal === 'N/A');
  console.log(`${missingAct.length} of them have 'N/A' or null activity.`);
  
  if (missingAct.length > 0) {
    console.log("Sample missing:", missingAct.slice(0, 5));
  }
}
checkSambilInDb();
