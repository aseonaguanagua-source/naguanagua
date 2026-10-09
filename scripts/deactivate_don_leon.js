require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { error } = await supabase.from('inmuebles').update({ estado: 'Inactivo' }).in('inmueble', ['URB006800', 'URB033046']);
  if (!error) console.log("Desactivados URB006800 y URB033046 exitosamente.");
}
run();
