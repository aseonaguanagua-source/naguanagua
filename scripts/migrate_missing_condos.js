require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const missingCodes = [
  'URB024783', 'URB028116', 'URB028483', 'URB029160', 'URB033554', 'URB034480', 'URB033244', 'URB034684', 'URB003322', // Residenciales
  'URB000326', 'URB034963' // Comerciales
];

async function run() {
  const { data: existing } = await supabase.from('condominios').select('codigo');
  const existingSet = new Set(existing.map(c => c.codigo));
  
  const toImport = missingCodes.filter(c => !existingSet.has(c));
  if (toImport.length === 0) {
    console.log("All already imported.");
    return;
  }
  
  console.log("Importing:", toImport);
  
  for (const codigo of toImport) {
    console.log(`Calling migration for ${codigo}...`);
    const res = await fetch(`http://localhost:3000/api/admin/migracion?jerarquia=${codigo}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario: { email: 'sistema' } })
    });
    const text = await res.text();
    console.log(`${codigo} -> ${res.status}:`, text);
  }
}
run();
