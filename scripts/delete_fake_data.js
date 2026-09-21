const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Borrando data falsa de certificados...');
  await supabase.from('certificados').delete().neq('id', 0);
  
  console.log('Borrando data falsa de reclamos...');
  await supabase.from('reclamos').delete().neq('id', 0);
  
  console.log('Borrando data falsa de convenios...');
  await supabase.from('convenios').delete().neq('id', 0);
  
  console.log('Borrando data falsa de pre_liquidaciones...');
  await supabase.from('pre_liquidaciones').delete().neq('id', 0);
  
  console.log('Limpieza completada.');
}

run();
