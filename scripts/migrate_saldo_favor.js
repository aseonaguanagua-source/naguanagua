const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('--- STARTING SALDO A FAVOR MIGRATION ---');

  const jsonPath = path.join(__dirname, '../../backup_sigyr/master_inmuebles_clean.json');
  console.log(`Loading JSON from ${jsonPath}...`);
  const raw = fs.readFileSync(jsonPath, 'utf8');
  const data = JSON.parse(raw);

  let toUpdate = [];

  for (const item of data) {
    if (item.saldo_favor_bs && item.saldo_favor_bs >= 1) {
      toUpdate.push({
        inmueble: item.inmueble,
        saldo: item.saldo_favor_bs
      });
    }
  }

  console.log(`Found ${toUpdate.length} inmuebles with saldo_favor_bs >= 1`);

  let updatedCount = 0;
  let errorCount = 0;
  const CHUNK_SIZE = 40;

  for (let i = 0; i < toUpdate.length; i += CHUNK_SIZE) {
    const chunk = toUpdate.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map(async (row) => {
        const { error } = await sb
          .from('inmuebles')
          .update({ saldo_favor_bs: row.saldo })
          .eq('inmueble', row.inmueble);

        if (error) {
          console.error(`Error updating ${row.inmueble}: ${error.message}`);
          errorCount++;
        } else {
          updatedCount++;
        }
      })
    );

    if ((i + CHUNK_SIZE) % 400 === 0 || i + CHUNK_SIZE >= toUpdate.length) {
      console.log(`Progress: ${Math.min(i + CHUNK_SIZE, toUpdate.length)} / ${toUpdate.length} inmuebles processed (${updatedCount} updated)`);
    }
  }

  console.log('--- MIGRATION COMPLETE ---');
  console.log(`Total Inmuebles Updated: ${updatedCount}`);
  console.log(`Errors: ${errorCount}`);
})();
