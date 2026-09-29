const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data: updated, error } = await supabase
    .from('inmuebles')
    .update({ mmv_mes: 1.06 })
    .eq('inmueble', 'AURI000001')
    .select('*');
    
  if (error) console.error(error);
  console.log("Updated AURI000001:", updated);
}
check();
