const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
let SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  try {
    const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
    const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
    const keyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
    if(urlMatch) SUPABASE_URL = urlMatch[1].trim();
    if(keyMatch) SUPABASE_KEY = keyMatch[1].trim();
  } catch(e) {}
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runDeleteFake() {
  const { data, error } = await supabase.from('inmuebles')
    .select('id, inmueble, tipo')
    .eq('actividad_principal', 'Condominio Generado Automáticamente')
    .neq('tipo', 'CONDOMINIO');

  if (error) {
    console.error("Error fetching fake condos:", error);
    return;
  }

  console.log(`Found ${data.length} fake condos to delete.`);
  
  for (const item of data) {
    console.log(`Deleting ${item.inmueble} (${item.tipo})...`);
    await supabase.from('inmuebles').delete().eq('id', item.id);
  }
  console.log("Done.");
}

runDeleteFake();
