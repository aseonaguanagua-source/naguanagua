require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: inmMul } = await supabase.from('inmuebles').select('id, multa_bs').eq('inmueble', 'URB018483').single();
  console.log("Multa en inmueble:", inmMul);
  
  if (inmMul) {
    const { data: multas } = await supabase.from('multas').select('*').eq('inmueble_id', inmMul.id);
    console.log("Multas manuales:", multas ? multas.length : 0);
  }
}
run();
