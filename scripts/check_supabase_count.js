const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function check() {
  const { count: cCount, error: cErr } = await supabase.from('contribuyentes').select('*', { count: 'exact', head: true });
  console.log('Contribuyentes count:', cCount);
  
  const { count: iCount, error: iErr } = await supabase.from('inmuebles').select('*', { count: 'exact', head: true });
  console.log('Inmuebles count:', iCount);

  // Check the bad record
  const { data: badRec } = await supabase.from('inmuebles').select('*').eq('inmueble', 'URB016147');
  console.log('URB016147:', badRec);
}
check();
