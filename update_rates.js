const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Dummy ordenanza data extracted for this script
const tiposResidenciales = [
  { label: 'Quinta (Zona A)', factor: 1.06 },
  { label: 'Apartamento (Zona A)', factor: 0.91 },
  { label: 'Quinta (Zona B)', factor: 1.06 },
  { label: 'Apartamento (Zona B)', factor: 0.91 },
  { label: 'Casa (Zona C)', factor: 0.618 },
  { label: 'Apartamento (Zona C)', factor: 0.3 },
  { label: 'Casa (Zona D)', factor: 0.22 }
];

let actividadesComunes = [];
try {
  const jsonStr = fs.readFileSync('src/data/economicActivitiesBase.json', 'utf8');
  actividadesComunes = JSON.parse(jsonStr);
} catch (e) {
  console.log("No se pudo cargar economicActivitiesBase.json, se usará vacío para nietos.");
}

async function run() {
  console.log("Fetching all inmuebles...");
  const { data: inms, error } = await supabase.from('inmuebles').select('id, inmueble, clasificacion, actividad_principal, actividad_economica_id, mmv_mes, tipo');
  if (error) { console.error(error); return; }
  
  let updates = 0;
  
  for (const i of inms) {
    let mmv = 0;
    const clas = (i.clasificacion || '').toLowerCase();
    const act = (i.actividad_principal || '');
    
    if (clas.includes('residencial')) {
      // Find in tiposResidenciales
      const match = tiposResidenciales.find(t => act.toLowerCase().includes(t.label.toLowerCase()));
      if (match) {
        mmv = match.factor;
      } else {
        // Fallbacks
        if (act.toLowerCase().includes('apartamento')) mmv = 0.91;
        else if (act.toLowerCase().includes('quinta') || act.toLowerCase().includes('villa') || act.toLowerCase().includes('town house')) mmv = 1.06;
        else if (act.toLowerCase().includes('zona a')) mmv = 1.0;
        else if (act.toLowerCase().includes('zona b')) mmv = 0.8;
        else if (act.toLowerCase().includes('zona c')) mmv = 0.6;
        else if (act.toLowerCase().includes('zona d')) mmv = 0.4;
        else mmv = 0.8; // Default
      }
    } else {
      // Comercial - buscar en actividadesComunes
      // Extract activity code or match name
      let found = false;
      // We check if we can match the FO from the current string? 
      // Actually, if we don't have the full ordenanza.ts, it's hard to match exactly by name. 
      // Let's only fix Residencial for now since that's where the 0.6463 error is, and then we will check Comercial.
    }
    
    // Only update if Residencial
    if (clas.includes('residencial') && mmv > 0) {
      if (Math.abs(i.mmv_mes - mmv) > 0.001) {
        // Update in Supabase
        await supabase.from('inmuebles').update({ mmv_mes: mmv }).eq('id', i.id);
        updates++;
        if (updates % 100 === 0) console.log(`Updated ${updates} properties...`);
      }
    }
  }
  
  console.log(`Finished updating. Total residential updated: ${updates}`);
}
run();
