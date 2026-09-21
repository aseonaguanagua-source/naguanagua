require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function run() {
  const { data } = await supabase.from('facturas').select('*').eq('identidad', 'J-309208675');
  const f1 = data[0];
  const f2 = data[1];
  console.log("F1:", f1.emision, new Date(f1.emision).getMonth(), new Date(f1.emision).getUTCMonth());
  console.log("F2:", f2.emision, new Date(f2.emision).getMonth(), new Date(f2.emision).getUTCMonth());
}
run();
