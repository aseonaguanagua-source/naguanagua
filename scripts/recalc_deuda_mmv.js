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

async function run() {
  console.log("Recalculando deuda_mmv = FO * 57 * FAR * 2 meses para todos los inmuebles...");
  let count = 0;
  let from = 0;
  const step = 1000;
  let all = [];
  while(true) {
    const { data, error } = await supabase.from('inmuebles').select('id, mmv_mes, tipo, cant_inmuebles').range(from, from + step - 1);
    if (error || !data || data.length === 0) break;
    all = all.concat(data);
    from += step;
  }
  
  for (let i = 0; i < all.length; i += 100) {
    const chunk = all.slice(i, i + 100);
    const promises = chunk.map(async item => {
       const mmv = parseFloat(item.mmv_mes || 0); // Este es el F.O.
       const cant = parseFloat(item.cant_inmuebles || 1);
       
       let ucdMultiplicador = 0.128; // Comercial por defecto
       if (item.tipo === 'Residencial') ucdMultiplicador = 0.02673;

       // Formula: FO * 57 * FAR(ucdMultiplicador) * 2 meses
       const deuda_mmv_correcta = mmv * 57 * ucdMultiplicador * cant * 2;
       
       await supabase.from('inmuebles').update({ 
         deuda_mmv: deuda_mmv_correcta
       }).eq('id', item.id);
    });
    await Promise.all(promises);
    count += chunk.length;
    process.stdout.write(`\rActualizados: ${count}/${all.length}`);
  }
  console.log("\nHecho.");
}
run();
