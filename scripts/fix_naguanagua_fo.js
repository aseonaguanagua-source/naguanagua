const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Extract ordenanzaData from src/data/ordenanza.ts via eval hack
const fileData = fs.readFileSync(path.join(__dirname, '../src/data/ordenanza.ts'), 'utf-8');
const jsonLike = fileData.replace('export const ordenanzaData =', '').replace(/;\s*$/, '');
// Need to convert to JSON or eval
let ordenanzaData;
eval('ordenanzaData = ' + jsonLike);

const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
let SUPABASE_URL = '';
let SUPABASE_KEY = '';
const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
if(urlMatch) SUPABASE_URL = urlMatch[1].trim();
if(keyMatch) SUPABASE_KEY = keyMatch[1].trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  console.log("Fetching commercial properties...");
  
  let all = [];
  let from = 0;
  const step = 1000;
  while(true) {
    const { data, error } = await supabase.from('inmuebles').select('id, actividad_principal, cant_inmuebles, tipo').eq('tipo', 'Comercial').range(from, from + step - 1);
    if (error || !data || data.length === 0) break;
    all = all.concat(data);
    from += step;
  }
  
  console.log(`Found ${all.length} commercial properties.`);
  
  let count = 0;
  for (let i = 0; i < all.length; i += 100) {
    const chunk = all.slice(i, i + 100);
    const promises = chunk.map(async item => {
       const actStr = item.actividad_principal || '';
       let nivelIndex = 0; // BAJA
       if (actStr.includes('(MEDIA)')) nivelIndex = 1;
       if (actStr.includes('(ALTA)')) nivelIndex = 2;
       
       let cleanActStr = actStr.replace(/\(BAJA\)/g, '').replace(/\(MEDIA\)/g, '').replace(/\(ALTA\)/g, '').trim();
       
       const foundAct = ordenanzaData.actividadesComerciales.find(a => a.label.toUpperCase() === cleanActStr.toUpperCase());
       let mmv = 0;
       
       if (foundAct) {
           mmv = foundAct.factores[nivelIndex];
       } else {
           const partialMatch = ordenanzaData.actividadesComerciales.find(a => cleanActStr.toUpperCase().includes(a.label.toUpperCase()) || a.label.toUpperCase().includes(cleanActStr.toUpperCase()));
           if (partialMatch) {
               mmv = partialMatch.factores[nivelIndex];
           }
       }
       
       if (mmv > 0) {
           const cant = parseFloat(item.cant_inmuebles || 1);
           const ucdMultiplicador = 0.128; // Comercial
           const deuda_mmv_correcta = mmv * 57 * ucdMultiplicador * cant * 2;
           
           await supabase.from('inmuebles').update({ 
             mmv_mes: mmv,
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
