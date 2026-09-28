const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { ordenanzaData } = require('./src/data/ordenanza_mock.js');

const todasLasActividades = [...ordenanzaData.actividadesComerciales, ...(ordenanzaData.actividadesIndustriales || [])];

const getFO = (actividadFull, esResidencial) => {
  const act = (actividadFull || "").toLowerCase().trim();
  
  if (esResidencial) {
    if (act.includes("quinta (a)") || act.includes("quinta (b)")) return 1.06;
    if (act.includes("apartamento (a)") || act.includes("apartamento (b)")) return 0.91;
    if (act.includes("casa (c)")) return 0.618;
    if (act.includes("apartamento (c)")) return 0.3;
    if (act.includes("casa (d)")) return 0.22;
    // Default fallback
    if (act.includes("apartamento")) return 0.91;
    if (act.includes("quinta") || act.includes("villa") || act.includes("town house")) return 1.06;
    return 0.80; // Default Casa
  }

  let labelToSearch = act.replace(/\(alta\)|\(media\)|\(baja\)/g, '').trim();
  let nivel = 'BAJA'; // Default
  if (act.includes('(alta)')) nivel = 'ALTA';
  if (act.includes('(media)')) nivel = 'MEDIA';
  
  let found = todasLasActividades.find(a => a.label.toLowerCase() === labelToSearch);
  if (!found) {
    found = todasLasActividades.find(a => a.label.toLowerCase().includes(labelToSearch) || labelToSearch.includes(a.label.toLowerCase()));
  }
  
  if (found && found.factores) {
    const idx = nivel === 'BAJA' ? 0 : (nivel === 'MEDIA' ? 1 : 2);
    return found.factores[idx] || 0;
  }
  
  return 0; // Default if not found
};

async function run() {
  const { data } = await supabase.from('inmuebles').select('actividad_principal, tipo, inmueble, identidad').neq('actividad_principal', null);
  
  const fails = new Set();
  
  for (const inm of data) {
    const esRes = (inm.tipo || '').toLowerCase().includes('residencial');
    const fo = getFO(inm.actividad_principal, esRes);
    if (fo === 0) {
      fails.add(inm.actividad_principal);
    }
  }
  
  console.log("Actividades que devuelven FO = 0 (causan En Verificacion):");
  Array.from(fails).forEach(f => console.log(f));
}
run();
