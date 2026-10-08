const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkCols() {
  const { data, error } = await sb.from('inmuebles').select('*').limit(1);
  if (data && data[0]) {
    console.log(Object.keys(data[0]));
  }
}
checkCols();
