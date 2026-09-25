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

async function testGroup() {
  console.log("Fetching...");
  const res = await fetch('http://localhost:3000/api/get-all-data');
  const json = await res.json();
  const allInmuebles = json.inmuebles;
  
  console.log(`Fetched ${allInmuebles?.length} inmuebles`);

        const condominiosMap = new Map();
        
        // Encontrar a los hijos para contar unidades
        const hijosPorPadre = new Map();
        allInmuebles.forEach(inm => {
          if (inm.actividad_principal && inm.actividad_principal.includes('[HIJO_DE:')) {
            const match = inm.actividad_principal.match(/\[HIJO_DE:(.*?)\]/);
            if (match) {
              const padre = match[1];
              hijosPorPadre.set(padre, (hijosPorPadre.get(padre) || 0) + 1);
            }
          }
        });

        // Crear lista de condominios
        const dbCondominiosList = [];
        allInmuebles.forEach(inm => {
          if (hijosPorPadre.has(inm.inmueble) || (inm.actividad_principal && inm.actividad_principal.toLowerCase().includes('condominio padre'))) {
            if (!condominiosMap.has(inm.inmueble)) {
              condominiosMap.set(inm.inmueble, true);
              dbCondominiosList.push({
                id: inm.id,
                codigo: inm.inmueble,
                identidad: inm.identidad,
                nombre: inm.contribuyentes?.nombre || `Condominio ${inm.inmueble}`,
                direccion: inm.contribuyentes?.direccion || inm.direccion || '',
                unidades: hijosPorPadre.get(inm.inmueble) || 0,
                representante: 'N/A',
                estado: inm.estado || 'Activo',
                created_at: inm.created_at
              });
            }
          }
        });
        
        console.log(`Generated ${dbCondominiosList.length} condominios!`);
        console.log("Sample:", dbCondominiosList[0]);
}

testGroup();
