const { createClient } = require('@supabase/supabase-js');

async function test() {
  const res = await fetch('http://localhost:3000/api/get-all-data');
  const json = await res.json();
  const allInmuebles = json.inmuebles;
  
        const condominiosMap = new Map();
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

        const dbCondominiosList = [];
        allInmuebles.forEach(inm => {
          if (hijosPorPadre.has(inm.inmueble) || (inm.actividad_principal && inm.actividad_principal.toLowerCase().includes('condominio padre'))) {
            if (!condominiosMap.has(inm.inmueble)) {
              condominiosMap.set(inm.inmueble, true);
              dbCondominiosList.push(inm.inmueble);
            }
          }
        });
        
        console.log("Includes URB025805?", dbCondominiosList.includes('URB025805'));
}
test();
