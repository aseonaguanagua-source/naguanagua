const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function listTables() {
  const { data, error } = await sb.rpc('get_tables_info');
  // If rpc doesn't work, we can just do a postgres query via psql or rest.
  if (error) {
    console.log("RPC Error:", error);
  } else {
    console.log("Tables:", data);
  }
}
listTables();
