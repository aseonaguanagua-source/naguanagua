require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  // Fetch all inmuebles with numero_local
  const { data: inmuebles } = await supabase.from('inmuebles').select('inmueble, numero_local').not('numero_local', 'is', null);
  
  if (!inmuebles || inmuebles.length === 0) {
    console.log("No inmuebles with numero_local found.");
    return;
  }
  
  console.log(`Found ${inmuebles.length} inmuebles with numero_local`);
  
  let updated = 0;
  for (let i = 0; i < inmuebles.length; i += 100) {
    const batch = inmuebles.slice(i, i + 100);
    for (const inm of batch) {
      if (inm.numero_local && String(inm.numero_local).trim().length > 0) {
        const { error } = await supabase.from('condominio_unidades').update({ numero: String(inm.numero_local).trim() }).eq('inmueble', inm.inmueble);
        if (!error) updated++;
      }
    }
  }
  console.log(`Updated ${updated} condominio_unidades with numero_local.`);
}
run();
