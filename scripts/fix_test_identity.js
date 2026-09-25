const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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

(async () => {
  const oldId = 'J-TEST-10MESES';
  const newId = 'JTEST10MESES';

  // Update in contribuyentes
  await supabase.from('contribuyentes').update({ identidad: newId }).eq('identidad', oldId);
  // Update in inmuebles
  await supabase.from('inmuebles').update({ identidad: newId }).eq('identidad', oldId);
  // Update in facturas
  await supabase.from('facturas').update({ identidad: newId }).eq('identidad', oldId);
  
  console.log("Updated identity to JTEST10MESES");
})();
