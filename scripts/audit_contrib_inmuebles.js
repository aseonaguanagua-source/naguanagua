const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const stringSimilarity = require('string-similarity');

let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
let SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL) {
  const envContent = fs.readFileSync('.env.local', 'utf-8');
  SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
  SUPABASE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function cleanName(n) {
  if (!n) return '';
  return n.replace(/[,\.\-\(\)0-9]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

async function run() {
  console.log("Fetching all...");
  const { data: inmuebles } = await supabase.from('inmuebles').select('identidad, contribuyente, inmueble');
  const { data: contribuyentes } = await supabase.from('contribuyentes').select('identidad, nombre');

  const contribMap = {};
  for (const c of contribuyentes) {
    if (c.identidad) contribMap[c.identidad.trim().toUpperCase()] = c.nombre;
  }

  const suspicious = [];

  for (const inm of inmuebles) {
    if (!inm.identidad || !inm.contribuyente) continue;
    const id = inm.identidad.trim().toUpperCase();
    const cName = contribMap[id];
    if (!cName) continue; // Not in contribuyentes yet, or pending

    const cleanC = cleanName(cName);
    const cleanI = cleanName(inm.contribuyente);

    const sim = stringSimilarity.compareTwoStrings(cleanC, cleanI);
    const isSubstring = cleanC.includes(cleanI) || cleanI.includes(cleanC);

    if (sim < 0.25 && !isSubstring && cleanI.length > 5 && cleanC.length > 5) {
      suspicious.push({
        identidad: id,
        inmueble: inm.inmueble,
        nombre_contribuyente: cName,
        nombre_inmueble: inm.contribuyente
      });
    }
  }

  console.log(`Found ${suspicious.length} mismatched records between contribuyentes and inmuebles.`);
  fs.writeFileSync('mismatched_names.json', JSON.stringify(suspicious, null, 2));
}

run();
