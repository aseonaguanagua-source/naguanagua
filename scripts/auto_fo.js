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

const ordenanzaData = {
  tiposResidenciales: [
    { label: 'Tipo I: Viviendas en zonas populares', factor: 0.50 },
    { label: 'Tipo II: Casas', factor: 0.80 },
    { label: 'Tipo III: Apartamentos', factor: 0.91 },
    { label: 'Tipo IV: Penthouse, Town House, Quintas, Villas', factor: 1.06 }
  ]
};

async function assignFO() {
  const { data: allInms } = await supabase.from('inmuebles').select('id, tipo, actividad_principal, mmv_mes');
  
  let updates = 0;
  for (let i = 0; i < allInms.length; i++) {
    const inm = allInms[i];
    
    // Si ya tiene un F.O. mayor a 0, lo respetamos a menos que queramos sobreescribirlo a la fuerza.
    if (parseFloat(inm.mmv_mes) > 0) continue;
    
    let newFO = 0;
    if (inm.tipo === 'Residencial') {
      if (inm.actividad_principal.includes('APARTAMENTO')) {
         newFO = 0.91;
      } else if (inm.actividad_principal.includes('CASA')) {
         newFO = 0.80;
      } else if (inm.actividad_principal.includes('QUINTA')) {
         newFO = 1.06;
      } else {
         newFO = 0.80; // por defecto Casas
      }
    } else {
      // Comercial por defecto Generacion Baja para actividades no encontradas
      newFO = 2.39; 
    }
    
    if (newFO > 0) {
      await supabase.from('inmuebles').update({ mmv_mes: newFO }).eq('id', inm.id);
      updates++;
      if (updates % 500 === 0) process.stdout.write('.');
    }
  }
  console.log(`\nF.O. base asignado a ${updates} inmuebles que estaban en 0.`);
}

assignFO();
