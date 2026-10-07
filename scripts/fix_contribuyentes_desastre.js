const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fixDesastre() {
  console.log("Restaurando nombres de contribuyentes desde inmuebles...");
  
  let from = 0;
  const step = 1000;
  let allInmuebles = [];
  
  while(true) {
    const { data, error } = await supabase.from('inmuebles')
      .select('identidad, contribuyente, telefono, correo_electronico, direccion, estado')
      .order('created_at', { ascending: false })
      .range(from, from + step - 1);
      
    if (error) { console.error(error); break; }
    if (data.length === 0) break;
    allInmuebles = allInmuebles.concat(data);
    from += step;
  }
  
  console.log(`Cargados ${allInmuebles.length} inmuebles.`);
  
  const contMap = new Map();
  for (const inm of allInmuebles) {
    if (!inm.identidad) continue;
    
    // Preferir los activos
    if (!contMap.has(inm.identidad) || (inm.estado === 'Activo' && contMap.get(inm.identidad).estado !== 'Activo')) {
      contMap.set(inm.identidad, inm);
    }
  }
  
  console.log(`Se encontraron ${contMap.size} contribuyentes únicos en inmuebles.`);
  
  let fixed = 0;
  const updates = [];
  for (const [identidad, inm] of contMap.entries()) {
    if (!inm.contribuyente) continue;
    updates.push({
      identidad,
      nombre: inm.contribuyente,
      telefono: inm.telefono || '',
      email: inm.correo_electronico || '',
      direccion: inm.direccion || ''
    });
  }
  
  for (let i = 0; i < updates.length; i += 500) {
    const chunk = updates.slice(i, i + 500);
    const { error } = await supabase.from('contribuyentes').upsert(chunk, { onConflict: 'identidad' });
    if (error) console.error("Error actualizando chunk:", error.message);
    else {
      fixed += chunk.length;
      process.stdout.write(`.${fixed}`);
    }
  }
  
  console.log(`\n¡${fixed} contribuyentes restaurados con éxito desde la tabla inmuebles!`);
  
  // Also, the user says "les asigana su cedala o rif como codigo de contribuyente".
  // This is a UI glitch in page.tsx where CodCont defaults to c.identidad when there's no match.
  // Wait, could it be that the UI is showing deactivated users because they were added to `contribuyentes` by the sync script?
  // Let's delete users from `contribuyentes` that have NO matching inmuebles.
  // Actually, we shouldn't delete them, maybe just mark them as 'Inactivo'.
}

fixDesastre();
