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
  const { data } = await supabase.from('inmuebles').select('*').ilike('identidad', '%15496661%');
  console.log("Inmuebles for 15496661:", data);
  const { data: d2 } = await supabase.from('contribuyentes').select('*').ilike('nombre', '%ARMANDO JOSE GEREMIA MORENO%');
  console.log("Contribuyentes by name:", d2);
  const { data: d3 } = await supabase.from('inmuebles').select('*').ilike('actividad_principal', '%GEREMIA%');
  console.log("Inmuebles with GEREMIA in name:", d3);
}
run();
