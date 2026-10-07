const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function test() {
  console.time('refreshUserData_inmuebles');
  const { error } = await supabase
    .from('inmuebles')
    .select('*')
    .or(`identidad.eq.V-00000000,identidad.eq.V00000000`);
  console.timeEnd('refreshUserData_inmuebles');
  if (error) console.error(error);
}
test();
