const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSambil() {
  const sambilCondoId = '7567ec01-6d34-4341-bc5b-5a69c64cba93';
  const { data, error } = await sb.from('condominio_unidades').select('inmueble, actividad').eq('condominio_id', sambilCondoId);
  
  if (error) {
    console.error(error);
    return;
  }
  
  const na = data.filter(d => !d.actividad || d.actividad === 'N/A');
  console.log(`Total units: ${data.length}`);
  console.log(`Units with N/A: ${na.length}`);
  
  if (na.length > 0) {
    console.log("Sample N/A units:", na.slice(0, 10).map(u => u.inmueble));
  }
}
checkSambil();
