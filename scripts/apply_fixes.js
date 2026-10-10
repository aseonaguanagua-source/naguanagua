const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
let SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL) {
  const envContent = fs.readFileSync('.env.local', 'utf-8');
  SUPABASE_URL = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
  SUPABASE_KEY = envContent.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const mismatches = JSON.parse(fs.readFileSync('mismatches.json', 'utf8'));

function getWords(name) {
  return name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(' ').filter(w => w.length > 3 && w !== 'CONDOMINIO' && w !== 'RESIDENCIAS' && w !== 'CONJUNTO' && w !== 'RESIDENCIAL');
}

let toFix = [];

for (let m of mismatches) {
  const wordsNew = getWords(m.nombreNuevo);
  const wordsOld = getWords(m.nombreRealViejo);
  
  // If either is empty after filtering, check direct substring
  if (wordsNew.length === 0 || wordsOld.length === 0) {
     const n1 = m.nombreNuevo.toUpperCase().replace(/[^A-Z]/g,'');
     const n2 = m.nombreRealViejo.toUpperCase().replace(/[^A-Z]/g,'');
     if (n1.includes(n2) || n2.includes(n1)) continue;
  } else {
     let shared = 0;
     for (let w of wordsOld) {
       if (wordsNew.some(nw => nw.includes(w) || w.includes(nw))) shared++;
     }
     if (shared > 0) continue; // They share at least one significant word, likely the same person
  }
  
  toFix.push(m);
}

console.log(`Filtrados ${toFix.length} registros que son TOTALMENTE distintos.`);

async function apply() {
  let contribsToInsert = [];
  
  for (let m of toFix) {
    let newId = m.inmueble;
    if (m.oldUser.documento && m.oldUser.documento !== '0') {
      newId = m.oldUser.documento + '-' + m.inmueble;
    }
    
    contribsToInsert.push({
      identidad: newId,
      nombre: m.oldUser.nombre || 'N/A',
      email: m.oldUser.email || 'N/A',
      telefono: m.oldUser.telefono || 'N/A',
      direccion: m.oldUser.direccion || 'Recuperado de histórico'
    });
    
    m.nuevaIdentidadPropuesta = newId;
  }
  
  console.log("Upserting " + contribsToInsert.length + " contribuyentes...");
  const { error } = await supabase.from('contribuyentes').upsert(contribsToInsert, { onConflict: 'identidad' });
  if (error) console.error("Error upserting contribs", error);
  else console.log("Contribuyentes insertados OK.");
  
  console.log("Actualizando " + toFix.length + " inmuebles...");
  let count = 0;
  for (let m of toFix) {
    const { error: err2 } = await supabase.from('inmuebles').update({ identidad: m.nuevaIdentidadPropuesta }).eq('inmueble', m.inmueble);
    if (err2) console.error("Error", err2);
    else count++;
  }
  console.log(`Inmuebles actualizados: ${count} de ${toFix.length}.`);
}

apply();
