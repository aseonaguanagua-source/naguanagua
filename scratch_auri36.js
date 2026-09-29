const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data: inms2 } = await supabase.from('inmuebles').select('*').ilike('inmueble', 'AURI000036');
  console.log("Inmuebles (AURI000036):", inms2);
}
check();
