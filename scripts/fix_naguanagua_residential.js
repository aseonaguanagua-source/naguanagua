const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
let SUPABASE_URL = '';
let SUPABASE_KEY = '';
const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
if(urlMatch) SUPABASE_URL = urlMatch[1].trim();
if(keyMatch) SUPABASE_KEY = keyMatch[1].trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  console.log("Fetching residential properties...");
  
  let all = [];
  let from = 0;
  const step = 1000;
  while(true) {
    const { data, error } = await supabase.from('inmuebles').select('id, mmv_mes, cant_inmuebles, tipo').eq('tipo', 'RESIDENCIAL').range(from, from + step - 1);
    if (error || !data || data.length === 0) break;
    all = all.concat(data);
    from += step;
  }
  
  // also get Residential (title case) just in case
  let from2 = 0;
  while(true) {
    const { data, error } = await supabase.from('inmuebles').select('id, mmv_mes, cant_inmuebles, tipo').eq('tipo', 'Residencial').range(from2, from2 + step - 1);
    if (error || !data || data.length === 0) break;
    all = all.concat(data);
    from2 += step;
  }
  
  console.log(`Found ${all.length} residential properties.`);
  
  let count = 0;
  for (let i = 0; i < all.length; i += 100) {
    const chunk = all.slice(i, i + 100);
    const promises = chunk.map(async item => {
       const mmv = parseFloat(item.mmv_mes || 0);
       
       if (mmv > 0) {
           const cant = parseFloat(item.cant_inmuebles || 1);
           const ucdMultiplicador = 0.02673; // Residencial
           const deuda_mmv_correcta = mmv * 57 * ucdMultiplicador * cant * 2;
           
           await supabase.from('inmuebles').update({ 
             deuda_mmv: deuda_mmv_correcta
           }).eq('id', item.id);
       }
    });
    await Promise.all(promises);
    count += chunk.length;
    process.stdout.write(`\rUpdated: ${count}/${all.length}`);
  }
  console.log("\nDone.");
}
run();
