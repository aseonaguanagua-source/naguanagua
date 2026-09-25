const fs = require('fs');
const readline = require('readline');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function loadNdjson(file) {
  const map = new Map();
  const fileStream = fs.createReadStream(file, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const obj = JSON.parse(line);
    map.set(obj.id, obj);
  }
  return map;
}

async function check() {
  const userMap = await loadNdjson('/Users/davidzara/.gemini/antigravity-ide/brain/012a9ac9-4cc8-403b-9eb8-3e79147f026d/scratch/users.ndjson');
  const propMap = await loadNdjson('/Users/davidzara/.gemini/antigravity-ide/brain/012a9ac9-4cc8-403b-9eb8-3e79147f026d/scratch/properties.ndjson');
  
  let desocupados = 0;
  let total = 0;
  
  for (const [propId, prop] of propMap.entries()) {
     if (prop.property_id === '21000') {
        const user = userMap.get(prop.user_id);
        const name = user ? (user.business_name || user.name) : 'UNKNOWN';
        const isDesocupado = name.toLowerCase().includes('desocupado');
        if (isDesocupado) desocupados++;
        total++;
        if (isDesocupado) {
          // console.log(`Desocupado: ${name} (urb: ${prop.urbaser_code})`);
        }
     }
  }
  console.log(`Total hijos en SQL: ${total}`);
  console.log(`Hijos desocupados: ${desocupados}`);
  
  // Now from Supabase
  const { data } = await supabase.from('inmuebles').select('inmueble, actividad_principal').ilike('actividad_principal', '%[HIJO_DE:URB016119]%');
  let desocupadosSupabase = 0;
  for (const d of data) {
     if (d.actividad_principal.toLowerCase().includes('desocupado')) {
        desocupadosSupabase++;
     }
  }
  console.log(`Total en Supabase: ${data.length}`);
  console.log(`Desocupados en Supabase: ${desocupadosSupabase}`);
}
check();
