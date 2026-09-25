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

(async () => {
  const { data: inmuebles } = await supabase.from('inmuebles')
    .select('*')
    .ilike('identidad', 'J%')
    .limit(1);

  if (inmuebles && inmuebles.length > 0) {
    const realInmueble = inmuebles[0];
    console.log("Real Inmueble:", realInmueble);

    // Now insert 10 months of debt for this exact identity!
    const facturas = [];
    const currentDate = new Date();
    for (let i = 9; i >= 0; i--) {
      const d = new Date(currentDate);
      d.setMonth(d.getMonth() - i);
      
      facturas.push({
        referencia: `RECIB-${Math.floor(Math.random() * 1000000)}-${i}`,
        contribuyente: realInmueble.contribuyente || realInmueble.nombre || 'COMERCIAL',
        identidad: realInmueble.identidad,
        monto: (50 * 42.00).toFixed(2), // Assume rate is 42
        emision: d.toISOString().split('T')[0],
        vencimiento: new Date(d.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        estado: 'Pendiente'
      });
    }

    const { error } = await supabase.from('facturas').insert(facturas);
    if (error) console.error("Error creating facturas:", error);
    else console.log(`Deuda inyectada para el usuario REAL: ${realInmueble.identidad}`);
  } else {
    console.log("No real J properties found.");
  }
})();
