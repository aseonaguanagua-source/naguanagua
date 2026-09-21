const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'c:/Users/david/Desktop/tucacas/global_green_tucacas/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('inmuebles').select('*').limit(5);
  console.log(data);
}

run();
