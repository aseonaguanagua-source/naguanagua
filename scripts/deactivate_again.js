require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const deactivated = JSON.parse(fs.readFileSync('inactive_codes.json', 'utf8'));
const deleted = JSON.parse(fs.readFileSync('deleted_codes.json', 'utf8'));

async function run() {
  const codes = [...deactivated, ...deleted];
  console.log(`Deactivating ${codes.length} properties back to Inactivo...`);
  
  let successCount = 0;
  for (let i = 0; i < codes.length; i += 100) {
    const batch = codes.slice(i, i + 100);
    const { error } = await supabase.from('inmuebles').update({ estado: 'Inactivo' }).in('inmueble', batch);
    if (!error) successCount += batch.length;
  }
  console.log(`Successfully deactivated ${successCount} properties to Inactivo.`);
}
run();
