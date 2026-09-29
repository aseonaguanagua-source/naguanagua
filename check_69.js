const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data: inms2, error } = await supabase.from('inmuebles').select('*').ilike('inmueble', 'URB000069');
  if (error) console.error(error);
  console.log("Inmuebles (URB000069):", inms2);
}
check();
