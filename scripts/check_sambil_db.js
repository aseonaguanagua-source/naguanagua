const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSambil() {
  const { data, error } = await sb.from('inmuebles').select('inmueble, actividad_principal').in('inmueble', ['URB016122', 'URB000571', 'URB016226', 'URB016120']);
  if (error) {
    console.error(error);
    return;
  }
  console.log(data);
}
checkSambil();
