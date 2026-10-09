require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const missingResidenciales = [
  'URB024783', 'URB028116', 'URB028483', 'URB029160', 'URB033554', 'URB034480', 'URB033244', 'URB034684', 'URB003322'
];

const missingComerciales = [
  'URB000326', 'URB034963'
];

async function run() {
  const allCodes = [...missingResidenciales, ...missingComerciales];
  console.log("Checking missing condominios:", allCodes);
  
  const { data: existing } = await supabase.from('inmuebles').select('*').in('inmueble', allCodes);
  console.log(`Found ${existing.length} of ${allCodes.length} in inmuebles`);
  
  // Here we would run the migration script logic for these specific codes
  // We can just call the migration endpoint or reproduce the logic
}
run();
