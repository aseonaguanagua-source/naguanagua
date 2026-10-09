const fs = require('fs');
const inactive = JSON.parse(fs.readFileSync('inactive_codes.json', 'utf8'));
const deleted = JSON.parse(fs.readFileSync('deleted_codes.json', 'utf8'));
const deactivated = new Set([...inactive, ...deleted]);

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.from('inmuebles').select('inmueble, estado, contribuyentes!inner(identidad)')
    .filter('contribuyentes.identidad', 'ilike', '%304689713%');
    
  if (data) {
    console.log(`Sambil total properties in DB right now: ${data.length}`);
    const affected = data.filter(d => deactivated.has(d.inmueble));
    console.log(`Number of Sambil properties that were JUST deactivated by our script: ${affected.length}`);
  } else {
    console.log(error);
  }
}
run();
