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

async function normalizeMmvToFO() {
  const { data, error } = await supabase.from('inmuebles').select('id, tipo, mmv_mes');
  if (error || !data) {
     console.log("Error fetch", error); return;
  }
  
  console.log(`Normalizando ${data.length} inmuebles de MMV a F.O...`);
  
  for (let i=0; i<data.length; i++) {
     const inm = data[i];
     const currentMmv = parseFloat(inm.mmv_mes);
     if (currentMmv > 0) {
         let ucdMultiplier = inm.tipo === 'Residencial' ? 0.02673 : 0.128;
         let newFO = currentMmv / (57 * ucdMultiplier);
         
         await supabase.from('inmuebles')
             .update({ mmv_mes: parseFloat(newFO.toFixed(4)) })
             .eq('id', inm.id);
             
         if (i % 1000 === 0) process.stdout.write('.');
     }
  }
  console.log("Listo!");
}

normalizeMmvToFO();
