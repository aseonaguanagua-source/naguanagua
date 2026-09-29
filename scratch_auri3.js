const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data: inms2 } = await supabase.from('inmuebles').select('*').ilike('inmueble', 'AURI000001');
  console.log("Inmuebles (AURI000001):", inms2);
  
  if (inms2 && inms2.length > 0) {
    const { data: user } = await supabase.from('contribuyentes').select('*').eq('Identidad', inms2[0].identidad);
    console.log("Contribuyente:", user);
    
    const { data: facts } = await supabase.from('facturas').select('*').eq('identidad', inms2[0].identidad);
    console.log("Facturas:", facts);
  }
}
check();
