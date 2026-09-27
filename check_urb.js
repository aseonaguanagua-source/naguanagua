const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data: inms } = await supabase
    .from('inmuebles')
    .select('*')
    .eq('inmueble', 'URB034400');
    
  console.log(inms);
}
check();
