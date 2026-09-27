require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const id = '19109082';
  
  // Check contribuyentes
  const { data: cont, error: e1 } = await supabase
    .from('contribuyentes')
    .select('*')
    .ilike('identidad', `%${id}%`);
    
  console.log('--- Contribuyentes ---');
  if (e1) console.error(e1);
  else console.log(JSON.stringify(cont, null, 2));

  // Check inmuebles
  const { data: inm, error: e2 } = await supabase
    .from('inmuebles')
    .select('*')
    .ilike('identidad', `%${id}%`);
    
  console.log('\n--- Inmuebles ---');
  if (e2) console.error(e2);
  else console.log(JSON.stringify(inm, null, 2));
}

run();
