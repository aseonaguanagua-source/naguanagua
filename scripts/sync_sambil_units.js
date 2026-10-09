const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const {data: condo} = await sb.from('condominios').select('id, codigo').ilike('nombre', '%A.S 24 VALENCIA%').single();
  const condoId = condo.id;
  const condoCodigo = condo.codigo; // URB016119
  
  // Get currently registered units in condominio_unidades
  const {data: existingUnits} = await sb.from('condominio_unidades').select('inmueble').eq('condominio_id', condoId);
  const existingSet = new Set(existingUnits.map(u => u.inmueble).filter(Boolean));
  
  // Find Hijos of Sambil in inmuebles
  const {data: hijos} = await sb.from('inmuebles').select('inmueble, contribuyente, actividad_principal, estado').eq('condominio_padre_id', condoCodigo);
  let allHierarchy = [...hijos];
  
  // Find Nietos of each Hijo
  for (let hijo of hijos) {
     const {data: nietos} = await sb.from('inmuebles').select('inmueble, contribuyente, actividad_principal, estado').eq('condominio_padre_id', hijo.inmueble);
     if (nietos && nietos.length > 0) {
         allHierarchy.push(...nietos);
     }
  }
  
  // Filter out the ones that are already in the condominio_unidades table
  const missing = allHierarchy.filter(u => u.inmueble && !existingSet.has(u.inmueble) && u.contribuyente !== 'N/A' && !u.contribuyente.includes('SERVICIOS VALETVA') && !u.contribuyente.includes('A.S 24'));
  
  console.log(`Found ${allHierarchy.length} total units in the hierarchy.`);
  console.log(`There are ${existingSet.size} units currently registered.`);
  console.log(`Found ${missing.length} missing units to insert.`);
  
  if (missing.length > 0) {
      // Map to condominio_unidades format
      const inserts = missing.map(m => ({
          condominio_id: condoId,
          inmueble: m.inmueble,
          numero: m.inmueble,
          propietario: m.contribuyente,
          identidad: null,
          actividad: m.actividad_principal,
          estado: m.estado === 'Eliminado' ? 'Eliminada' : (m.estado === 'Desocupado' ? 'Desocupada' : 'Activa')
      }));
      
      // Batch insert
      for (let i = 0; i < inserts.length; i += 300) {
          const {error} = await sb.from('condominio_unidades').insert(inserts.slice(i, i+300));
          if (error) {
              console.error('Error inserting missing units:', error);
              return;
          }
      }
      
      // Update cant_declarada to match the new total units count (assuming we want to match registered count)
      const newTotal = existingSet.size + missing.length;
      await sb.from('condominios').update({ cant_declarada: newTotal }).eq('id', condoId);
      console.log(`Successfully inserted ${missing.length} units and updated cant_declarada to ${newTotal}.`);
  }
}

run().catch(console.error);
