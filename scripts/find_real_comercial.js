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
  const { data: contribuyentes } = await supabase.from('contribuyentes')
    .select('*')
    .ilike('identidad', 'J%')
    .limit(1);

  if (contribuyentes && contribuyentes.length > 0) {
    const realUser = contribuyentes[0];
    console.log("Real user:", realUser);

    const { data: inm } = await supabase.from('inmuebles').select('*').eq('identidad', realUser.identidad);
    console.log("Real user properties:", inm);
  } else {
    console.log("No real J taxpayers found.");
  }
})();
