const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

async function check() {
  const { count: c } = await supabase.from('contribuyentes').select('*', { count: 'exact', head: true });
  console.log('Total Contribuyentes:', c);
  const { count: i } = await supabase.from('inmuebles').select('*', { count: 'exact', head: true });
  console.log('Total Inmuebles:', i);
}
check();
