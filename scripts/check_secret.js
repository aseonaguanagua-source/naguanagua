const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!SUPABASE_URL) {
  try {
    const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
    const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
    if(urlMatch) SUPABASE_URL = urlMatch[1].trim();
  } catch(e) {}
}

const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

(async () => {
  const { data, error } = await supabase.from('pagos_reportados').select('*').limit(1);
  console.log("Error with secret:", error);
  console.log("Data with secret:", data);
})();
