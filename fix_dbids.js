require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data: conts } = await supabase.from('contribuyentes').select('identidad').limit(5);
  console.log('Sample identities from DB:', conts);
}
run();
