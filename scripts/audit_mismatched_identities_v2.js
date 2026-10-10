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
  return n.replace(/[,\.\-\(\)0-9]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

async function run() {
  console.log("Fetching all inmuebles...");
  const { data: inmuebles, error } = await supabase.from('inmuebles').select('identidad, contribuyente, inmueble');
  if (error) { console.error(error); return; }

  const groups = {};
  for (const inm of inmuebles) {
    if (!inm.identidad) continue;
    const id = inm.identidad.trim().toUpperCase();
    if (!groups[id]) groups[id] = [];
    groups[id].push(inm);
  }

  const suspicious = [];

  for (const [id, inms] of Object.entries(groups)) {
    if (inms.length <= 1) continue;
    
    const uniqueRawNames = [...new Set(inms.map(i => (i.contribuyente || '').trim()))].filter(Boolean);
    if (uniqueRawNames.length <= 1) continue;
    
    // Clean names to ignore punctuation and numbers
    const cleanNames = uniqueRawNames.map(cleanName);
    const uniqueClean = [...new Set(cleanNames)];
    
    if (uniqueClean.length <= 1) continue;

    // Compare pairwise similarity of clean names
    let isSuspicious = false;
    for (let i = 0; i < uniqueClean.length; i++) {
      for (let j = i + 1; j < uniqueClean.length; j++) {
        const sim = stringSimilarity.compareTwoStrings(uniqueClean[i], uniqueClean[j]);
        // If similarity is less than 0.4, it's highly likely to be two completely different names
        // unless one name is very short and contained entirely within the other.
        const isSubstring = uniqueClean[i].includes(uniqueClean[j]) || uniqueClean[j].includes(uniqueClean[i]);
        if (sim < 0.35 && !isSubstring) {
          isSuspicious = true;
          break;
        }
      }
      if (isSuspicious) break;
    }

    if (isSuspicious) {
      suspicious.push({ id, names: uniqueRawNames, inms: inms.map(i => ({inmueble: i.inmueble, nombre: i.contribuyente})) });
    }
  }

  console.log(`Found ${suspicious.length} highly suspicious identities.`);
  fs.writeFileSync('suspicious_identities.json', JSON.stringify(suspicious, null, 2));
}

run();
