require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanInactiveLocals() {
  console.log("Fetching inmuebles inactivos o eliminados con numero_local asignado...");
  
  let allInmuebles = [];
  let start = 0;
  const step = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('inmuebles')
      .select('id, numero_local, estado')
      .in('estado', ['Inactivo', 'Eliminado', 'Cerrado', 'Desactivado'])
      .range(start, start + step - 1);

    if (error) {
      console.error("Error fetching:", error);
      return;
    }
    allInmuebles.push(...data);
    if (data.length < step) {
      hasMore = false;
    } else {
      start += step;
    }
  }

  // Filtrar los que tienen un numero_local válido que podría estar causando conflicto
  const toUpdate = allInmuebles.filter(inv => {
    return inv.numero_local && 
           inv.numero_local.trim() !== '' && 
           !inv.numero_local.toLowerCase().includes('aplica') &&
           inv.numero_local !== '0'; // A veces 0 es genérico, pero si es 0 también causa conflictos si muchos lo tienen
  });

  console.log(`Se encontraron ${toUpdate.length} inmuebles inactivos/eliminados con numero_local que necesitan ser desvinculados.`);

  if (toUpdate.length === 0) {
    console.log("No hay nada que limpiar.");
    return;
  }

  // Update in batches
  const batchSize = 100;
  let updatedCount = 0;

  for (let i = 0; i < toUpdate.length; i += batchSize) {
    const batch = toUpdate.slice(i, i + batchSize);
    const ids = batch.map(b => b.id);
    
    // Set numero_local to 'NO_APLICA'
    const { error } = await supabase
      .from('inmuebles')
      .update({ numero_local: 'NO_APLICA' })
      .in('id', ids);

    if (error) {
      console.error(`Error updating batch ${i}:`, error);
    } else {
      updatedCount += batch.length;
      console.log(`Updated ${updatedCount} / ${toUpdate.length}`);
    }
  }

  console.log("✅ Limpieza completada. Los inmuebles inactivos ya no causarán conflictos de agrupación de locales en Caja.");
}

cleanInactiveLocals();
