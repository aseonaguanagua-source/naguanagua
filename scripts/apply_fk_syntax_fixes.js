const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const remainingFkFixes = [
  { oldId: 'V-7537637+', newId: 'V-7537637' },
  { oldId: 'V-*6178986', newId: 'V-6178986' },
  { oldId: 'V-V3843321', newId: 'V-3843321' },
  { oldId: 'V-8 006098', newId: 'V-8006098' }
];

(async () => {
  console.log('Resolving foreign key referenced syntax fixes...');

  for (const item of remainingFkFixes) {
    // 1. Get old contribuyente data
    const { data: oldContrib, error: getErr } = await sb
      .from('contribuyentes')
      .select('*')
      .eq('identidad', item.oldId)
      .maybeSingle();

    if (getErr || !oldContrib) {
      console.log(`Could not find old contribuyente for ${item.oldId}`);
      continue;
    }

    // 2. Insert new contribuyente with newId
    const newContribData = {
      ...oldContrib,
      identidad: item.newId
    };
    delete newContribData.id; // allow new id or keep same

    const { error: insErr } = await sb
      .from('contribuyentes')
      .upsert(newContribData, { onConflict: 'identidad' });

    if (insErr) {
      console.error(`Error inserting new contribuyente ${item.newId}:`, insErr.message);
      continue;
    }

    // 3. Update inmuebles to point to newId
    const { data: updInm, error: inmErr } = await sb
      .from('inmuebles')
      .update({ identidad: item.newId })
      .eq('identidad', item.oldId)
      .select('id, inmueble');

    if (inmErr) {
      console.error(`Error updating inmuebles from ${item.oldId} -> ${item.newId}:`, inmErr.message);
      continue;
    }

    console.log(`Updated ${updInm.length} inmueble(s) for ${item.newId}`);

    // 4. Now safe to delete old contribuyente
    const { error: delErr } = await sb
      .from('contribuyentes')
      .delete()
      .eq('identidad', item.oldId);

    if (delErr) {
      console.error(`Error deleting old contribuyente ${item.oldId}:`, delErr.message);
    } else {
      console.log(`Successfully migrated ${item.oldId} -> ${item.newId} and deleted legacy record.`);
    }
  }

  console.log('FK syntax corrections complete!');
})();
