const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
let SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  try {
    const envContent = fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf-8');
    const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
    const keyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
    if(urlMatch) SUPABASE_URL = urlMatch[1].trim();
    if(keyMatch) SUPABASE_KEY = keyMatch[1].trim();
  } catch(e) {}
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
  const cRes = await supabase.from('contribuyentes').insert({
    identidad: 'URB025805',
    nombre: 'Condominio URB025805',
    email: 'N/A',
    telefono: 'N/A',
    direccion: 'Migración'
  });
  console.log("Contribuyente insert:", cRes.error || "Success");

  const iRes = await supabase.from('inmuebles').insert({
    inmueble: 'URB025805',
    identidad: 'URB025805',
    tipo: 'Residencial',
    actividad_principal: 'Condominio Padre',
    direccion: 'Migración'
  });
  console.log("Inmueble insert:", iRes.error || "Success");
}
check();
