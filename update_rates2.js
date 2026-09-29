const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const tiposResidenciales = [
  { label: 'Quinta (Zona A)', factor: 1.06 },
  { label: 'Apartamento (Zona A)', factor: 0.91 },
  { label: 'Quinta (Zona B)', factor: 1.06 },
  { label: 'Apartamento (Zona B)', factor: 0.91 },
  { label: 'Casa (Zona C)', factor: 0.618 },
  { label: 'Apartamento (Zona C)', factor: 0.3 },
  { label: 'Casa (Zona D)', factor: 0.22 }
];

let economicActivitiesBase = [];
try {
  const jsonStr = fs.readFileSync('src/data/economicActivitiesBase.json', 'utf8');
  economicActivitiesBase = JSON.parse(jsonStr);
} catch (e) {
  console.log("No se pudo cargar json.");
}

async function run() {
  console.log("Fetching ALL inmuebles...");
  let allInms = [];
  let from = 0;
  let to = 999;
  
  while (true) {
    const { data, error } = await supabase.from('inmuebles').select('*').range(from, to);
    if (error) { console.error(error); break; }
    if (!data || data.length === 0) break;
    allInms = allInms.concat(data);
    from += 1000;
    to += 1000;
  }
  
  console.log(`Loaded ${allInms.length} properties.`);
  let updatesResidencial = 0;
  let updatesComercial = 0;
  
  for (const i of allInms) {
    let mmv = 0;
    const clas = (i.clasificacion || '').toLowerCase();
    const act = (i.actividad_principal || '');
    
    if (clas.includes('residencial')) {
      const match = tiposResidenciales.find(t => act.toLowerCase().includes(t.label.toLowerCase()));
      if (match) {
        mmv = match.factor;
      } else {
        if (act.toLowerCase().includes('apartamento')) mmv = 0.91;
        else if (act.toLowerCase().includes('quinta') || act.toLowerCase().includes('villa') || act.toLowerCase().includes('town house')) mmv = 1.06;
        else if (act.toLowerCase().includes('zona a')) mmv = 1.0;
        else if (act.toLowerCase().includes('zona b')) mmv = 0.8;
        else if (act.toLowerCase().includes('zona c')) mmv = 0.6;
        else if (act.toLowerCase().includes('zona d')) mmv = 0.4;
        else mmv = 0.8; 
      }
      
      if (mmv > 0 && Math.abs(i.mmv_mes - mmv) > 0.001) {
        await supabase.from('inmuebles').update({ mmv_mes: mmv }).eq('id', i.id);
        updatesResidencial++;
        if (updatesResidencial % 500 === 0) console.log(`Updated ${updatesResidencial} residential...`);
      }
    } else {
      // Comercial
      let foPadre = 0;
      if (i.actividad_economica_id && !i.actividad_economica_id.includes(',')) {
         const found = economicActivitiesBase.find(e => String(e.codigo) === String(i.actividad_economica_id));
         if (found) foPadre = found.monto_mensual_f_o;
      } else if (i.actividad_economica_id && i.actividad_economica_id.includes(',')) {
         // Has nietos
         const codes = i.actividad_economica_id.split(',').map(c => c.trim()).filter(c => c.length > 0);
         for (const c of codes) {
           const found = economicActivitiesBase.find(e => String(e.codigo) === String(c));
           if (found) foPadre += found.monto_mensual_f_o;
         }
      }
      
      // If we couldn't calculate from codes, we don't overwrite if they already have something. 
      // But if we DID calculate a valid FO from codes, we check and update.
      if (foPadre > 0 && Math.abs(i.mmv_mes - foPadre) > 0.001) {
        await supabase.from('inmuebles').update({ mmv_mes: foPadre }).eq('id', i.id);
        updatesComercial++;
        if (updatesComercial % 500 === 0) console.log(`Updated ${updatesComercial} commercial...`);
      }
    }
  }
  
  console.log(`Finished updating. Res updated: ${updatesResidencial}, Com updated: ${updatesComercial}`);
}
run();
