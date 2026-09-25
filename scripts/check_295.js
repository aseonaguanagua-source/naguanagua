const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function check() {
  const { data: inms } = await supabase.from('inmuebles').select('*').eq('identidad', '295063008');
  console.log('Inmuebles for 295063008:', inms.length);
  const bad = inms.find(i => i.mmv_mes > 50);
  if (bad) console.log('Found BAD mmv_mes:', bad);
  else console.log('No bad mmv_mes > 50 found!');
}
check();
