const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
let SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL) {
  const envContent = fs.readFileSync('.env.local', 'utf-8');
  SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
  SUPABASE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  const { data } = await supabase.from('pagos_reportados').select('id, identidad').ilike('detalles', '%URB007034%');
  console.log("Pagos con URB007034:", data);
  if (data && data.length > 0) {
    const ids = data.map(d => d.id);
    const { error } = await supabase.from('pagos_reportados').update({ identidad: 'J-507840433' }).in('id', ids);
    console.log("Updated pagos error:", error);
  }
}
run();
