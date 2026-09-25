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

async function repairCondominios() {
  const { data: allInms } = await supabase.from('inmuebles').select('inmueble, actividad_principal');
  
  const parentsToCreate = new Set();
  const existingInmuebles = new Set(allInms.map(i => i.inmueble));
  
  allInms.forEach(inm => {
    if (inm.actividad_principal && inm.actividad_principal.startsWith('[HIJO_DE:')) {
      const parentIdMatch = inm.actividad_principal.match(/\[HIJO_DE:(.*?)\]/);
      if (parentIdMatch) {
        const parentId = parentIdMatch[1];
        if (!existingInmuebles.has(parentId)) {
          parentsToCreate.add(parentId);
        }
      }
    }
  });

  const parentsArray = Array.from(parentsToCreate);
  console.log(`Faltan ${parentsArray.length} condominios padre. Creando...`);
  
  for (const parentId of parentsArray) {
    const { data: cData } = await supabase.from('contribuyentes').select('id').eq('identidad', parentId);
    if (!cData || cData.length === 0) {
      const { error: e1 } = await supabase.from('contribuyentes').insert({
        identidad: parentId,
        nombre: `Condominio ${parentId}`,
        email: 'N/A',
        telefono: 'N/A',
        direccion: 'Migración'
      });
      if (e1) console.log("Error contrib:", e1.message);
    }
    
    const { error: e2 } = await supabase.from('inmuebles').insert({
      inmueble: parentId,
      identidad: parentId,
      tipo: 'Residencial',
      actividad_principal: 'Condominio Padre',
      direccion: 'Migración',
      estado: 'Activo',
      cant_inmuebles: 1,
      mmv_mes: 0.91,
      deuda_mmv: 0
    });
    if (e2) console.log("Error inmueble:", e2.message);
  }
  
  console.log("Reparación completa.");
}

repairCondominios();
