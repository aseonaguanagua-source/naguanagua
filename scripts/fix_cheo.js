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
  // Move URB007034 to J-507840433
  console.log("Moving URB007034 to J-507840433...");
  const { error: e1 } = await supabase.from('inmuebles').update({
    identidad: 'J-507840433',
    contribuyente: 'MULTISERVICIOS MECANICO CHEO, C.A.'
  }).eq('inmueble', 'URB007034');
  if (e1) console.error("Error moving property:", e1);
  
  // Make J-507840433 Active
  const { error: e2 } = await supabase.from('contribuyentes').update({
    estado: 'Activo'
  }).eq('identidad', 'J-507840433');
  if (e2) console.error("Error activating Cheo:", e2);
  
  console.log("Done.");
}
run();
