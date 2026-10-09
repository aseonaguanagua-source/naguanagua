require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const inactive = JSON.parse(fs.readFileSync('inactive_codes.json', 'utf8'));
const deleted = JSON.parse(fs.readFileSync('deleted_codes.json', 'utf8'));
const deactivated = [...inactive, ...deleted];

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  let totalDeuda = 0;
  for(let i=0; i<deactivated.length; i+=100) {
     const batch = deactivated.slice(i, i+100);
     const { data } = await supabase.from('inmuebles').select('deuda_mmv').in('inmueble', batch);
     if (data) totalDeuda += data.reduce((acc, curr) => acc + (curr.deuda_mmv || 0), 0);
  }
  const totalBs = totalDeuda * 976.452; 
  console.log(`Deuda total de los ${deactivated.length} códigos que desactivamos: ${totalBs.toLocaleString('de-DE')} VES`);
}
run();
