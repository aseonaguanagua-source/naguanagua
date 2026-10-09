require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const codes = JSON.parse(fs.readFileSync('inactive_codes.json', 'utf8'));
  console.log(`Applying Inactivo status to ${codes.length} properties...`);
  
  let successCount = 0;
  const batchSize = 100;
  
  for (let i = 0; i < codes.length; i += batchSize) {
    const batch = codes.slice(i, i + batchSize);
    
    // Using Supabase update with in filter
    const { error } = await supabase
      .from('inmuebles')
      .update({ estado: 'Inactivo' })
      .in('inmueble', batch);
      
    if (error) {
      console.error(`Error in batch ${i/batchSize}:`, error);
    } else {
      successCount += batch.length;
      process.stdout.write(`\rUpdated batch ${successCount}/${codes.length}`);
    }
  }
  console.log("\nFinished updating all inactive users!");
}

run();
