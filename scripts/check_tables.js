require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.rpc('get_tables');
  if (error) {
    // If no rpc, let's just query a known system table or query via postgres directly? We can't query pg_catalog via REST.
    // Let's look at the source code in `src/app/(admin)/admin` to see where debts are fetched from.
    console.log('Error calling rpc');
  } else {
    console.log(data);
  }
}
run();
