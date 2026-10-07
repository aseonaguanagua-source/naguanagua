const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  console.time('update_identidad');
  const { error } = await supabase.from('inmuebles').update({ telefono: '555' }).eq('identidad', 'V-00000000');
  console.timeEnd('update_identidad');
  if (error) console.error(error);
}
test();
