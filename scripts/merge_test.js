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

async function merge() {
  const oldId = 'V-14024714';
  const newId = 'V-15496661';
  
  console.log(`Merging ${oldId} into ${newId}...`);

  const { error: err1 } = await supabase.from('inmuebles').update({ identidad: newId }).eq('identidad', oldId);
  if (err1) console.error("Error updating inmuebles:", err1.message);

  const { error: err2 } = await supabase.from('pagos_reportados').update({ identidad: newId }).eq('identidad', oldId);
  if (err2) console.error("Error updating pagos:", err2.message);
  
  const { error: err3 } = await supabase.from('contribuyentes').delete().eq('identidad', oldId);
  if (err3) console.error("Error deleting old:", err3.message);
  else console.log("Merge completed successfully!");
}
merge();
