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

async function run() {
  console.log("Fetching all inmuebles...");
  const { data: inmuebles, error } = await supabase.from('inmuebles').select('identidad, contribuyente, inmueble');
  if (error) { console.error(error); return; }

  // Group by identidad
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
    
    // Check if names are very different
    const names = [...new Set(inms.map(i => (i.contribuyente || '').trim().toUpperCase()))].filter(Boolean);
    if (names.length <= 1) continue;
    
    // Compare pairwise similarity
    let isSuspicious = false;
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        // Simple trick: extract RIFs or check similarity
        // If string similarity is less than 0.4, it's definitely two different people
        // (e.g. "JUAN PEREZ" vs "MECANICA CHEO")
        // We'll use a basic jaccard/levenshtein or just word intersection
        const wordsA = names[i].split(/\s+/);
        const wordsB = names[j].split(/\s+/);
        const intersect = wordsA.filter(w => wordsB.includes(w) && w.length > 2);
        
        // If they share almost no words > 2 chars, it's suspicious
        if (intersect.length === 0 && wordsA.length > 1 && wordsB.length > 1) {
          isSuspicious = true;
          break;
        }
      }
      if (isSuspicious) break;
    }

    if (isSuspicious) {
      suspicious.push({ id, inms });
    }
  }

  console.log(`Found ${suspicious.length} suspicious identities where multiple distinct names are grouped under the same ID.`);
  fs.writeFileSync('suspicious_identities.json', JSON.stringify(suspicious, null, 2));
  console.log("Saved to suspicious_identities.json");
}

run();
