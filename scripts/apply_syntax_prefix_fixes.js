const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const syntaxCorrections = [
  { oldId: 'V-7537637+', newId: 'V-7537637' },
  { oldId: 'V-*6178986', newId: 'V-6178986' },
  { oldId: 'V-V14537734', newId: 'V-14537734' },
  { oldId: 'V-V16152454', newId: 'V-16152454' },
  { oldId: 'V-V14715469', newId: 'V-14715469' },
  { oldId: 'V-V7744287', newId: 'V-7744287' },
  { oldId: 'V-V2841685', newId: 'V-2841685' },
  { oldId: 'V-V3843321', newId: 'V-3843321' },
  { oldId: 'V-V11360324', newId: 'V-11360324' },
  { oldId: 'V-V15151087', newId: 'V-15151087' },
  { oldId: 'V-8 006098', newId: 'V-8006098' }
];

const duplicateVEToDelete = ['V-E00233', 'V-E00100', 'V-E00030'];

(async () => {
  console.log('Applying syntax fixes to contribuyentes and inmuebles...');

  for (const item of syntaxCorrections) {
    // 1. Update in inmuebles
    const { data: inmData, error: inmErr } = await sb
      .from('inmuebles')
      .update({ identidad: item.newId })
      .eq('identidad', item.oldId)
      .select('id, inmueble');

    if (inmErr) {
      console.error(`Error updating inmueble for ${item.oldId}:`, inmErr.message);
    } else if (inmData && inmData.length > 0) {
      console.log(`Updated ${inmData.length} inmuebles from ${item.oldId} -> ${item.newId} (${inmData.map(i => i.inmueble).join(', ')})`);
    }

    // 2. Update in contribuyentes
    const { data: cData, error: cErr } = await sb
      .from('contribuyentes')
      .update({ identidad: item.newId })
      .eq('identidad', item.oldId)
      .select('identidad, nombre');

    if (cErr) {
      console.error(`Error updating contribuyente for ${item.oldId}:`, cErr.message);
    } else if (cData && cData.length > 0) {
      console.log(`Updated contribuyente from ${item.oldId} -> ${item.newId} (${cData[0].nombre})`);
    }
  }

  // 3. Delete redundant V-E duplicates
  for (const oldId of duplicateVEToDelete) {
    const { error: delErr } = await sb
      .from('contribuyentes')
      .delete()
      .eq('identidad', oldId);

    if (delErr) {
      console.error(`Error deleting duplicate ${oldId}:`, delErr.message);
    } else {
      console.log(`Deleted redundant duplicate contribuyente ${oldId} (already exists as ${oldId.replace('V-', '')})`);
    }
  }

  console.log('Finished applying syntax corrections!');
})();
