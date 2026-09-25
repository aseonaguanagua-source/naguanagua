const fs = require('fs');
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function check() {
  const ids = [];
  const pStream = fs.createReadStream('/Users/davidzara/.gemini/antigravity-ide/brain/012a9ac9-4cc8-403b-9eb8-3e79147f026d/scratch/properties.ndjson', { encoding: 'utf8' });
  const pRl = readline.createInterface({ input: pStream });
  
  for await (const line of pRl) {
    if (!line) continue;
    const prop = JSON.parse(line);
    if (prop.property_id === '21000') {
       let cat = prop.urbaser_code && prop.urbaser_code !== 'SN' ? prop.urbaser_code : prop.catastral_id;
       ids.push(cat);
    }
  }
  
  const { data } = await supabase.from('inmuebles').select('inmueble, actividad_principal').in('inmueble', ids);
  
  let weird = data.filter(d => !d.actividad_principal.includes('[HIJO_DE:URB016119]'));
  console.log('Properties missing the exact string [HIJO_DE:URB016119]:', weird);
}
check();
