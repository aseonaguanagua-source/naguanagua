require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const deactivated = JSON.parse(fs.readFileSync('inactive_codes.json', 'utf8'));
const deleted = JSON.parse(fs.readFileSync('deleted_codes.json', 'utf8'));

// Only revert those that actually HAVE deuda_mmv > 0 or mmv_mes > 0 in our DB (which means they were in the Excel)
// Actually let's just revert ALL of them back to 'Activo' for now to be safe,
// Then we can do a proper intersection with the Excel data.

async function run() {
  const codes = [...deactivated, ...deleted];
  console.log(`Reverting ${codes.length} properties back to Activo...`);
  
  let successCount = 0;
  for (let i = 0; i < codes.length; i += 100) {
    const batch = codes.slice(i, i + 100);
    const { error } = await supabase.from('inmuebles').update({ estado: 'Activo' }).in('inmueble', batch);
    if (!error) successCount += batch.length;
  }
  console.log(`Successfully reverted ${successCount} properties to Activo.`);
}
run();
