require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  console.log("Fetching matching records...");
  
  let hasMore = true;
  let totalFixed = 0;
  
  while (hasMore) {
    // Fetch a chunk of mismatched records
    const { data, error } = await supabase
      .from('inmuebles')
      .select('id')
      .eq('tipo', 'COMERCIAL')
      .eq('clasificacion', 'Residencial')
      .limit(500);

    if (error) {
      console.error("Error fetching:", error);
      break;
    }

    if (!data || data.length === 0) {
      hasMore = false;
      break;
    }

    console.log(`Found ${data.length} records. Updating...`);
    const ids = data.map(d => d.id);
    
    // Update chunk
    const { error: updateError } = await supabase
      .from('inmuebles')
      .update({ clasificacion: 'Comercial' })
      .in('id', ids);
      
    if (updateError) {
      console.error("Error updating chunk:", updateError);
      break;
    }
    
    totalFixed += ids.length;
    console.log(`Successfully fixed ${totalFixed} records so far...`);
  }
  
  console.log(`Done! Total records fixed: ${totalFixed}`);
}

run();
